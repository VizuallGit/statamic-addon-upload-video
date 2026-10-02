(function () {
    'use strict';

    Statamic.booting(() => {
        const { h, ref, watch } = window.Vue;

        Statamic.$components.register('upload-video-fieldtype', {
            inheritAttrs: false,
            props: {
                value: { default: null },
                meta: { type: Object, default: () => ({}) },
                config: { type: Object, default: () => ({}) },
            },
            emits: ['update:value', 'focus', 'blur'],
            setup(props, { emit }) {
                const video = ref(read(props.value));
                const busy = ref(false);
                const error = ref('');
                const knownDuration = ref(video.value.duration);
                let player = null;
                let lastEmitted = null;

                watch(() => props.value, (next) => {
                    if (JSON.stringify(next ?? null) === lastEmitted) {
                        return;
                    }
                    video.value = read(next);
                    knownDuration.value = video.value.duration;
                }, { deep: true });

                function empty() {
                    return read(null);
                }

                function read(next) {
                    if (!next || typeof next !== 'object' || !next.id) {
                        return {
                            id: null,
                            filename: '',
                            extension: '',
                            poster_at: 1,
                            size: 720,
                            quality: 'standard',
                            audio: true,
                            duration: null,
                        };
                    }

                    return {
                        id: next.id,
                        filename: next.filename || '',
                        extension: next.extension || '',
                        poster_at: Number(next.poster_at ?? 1),
                        size: next.size == null || next.size === 'original' ? 'original' : Number(next.size),
                        quality: next.quality || 'standard',
                        audio: next.audio !== false && next.audio !== 0 && next.audio !== 'false',
                        duration: next.duration == null ? null : Number(next.duration),
                    };
                }

                function emitValue() {
                    if (!video.value.id) {
                        lastEmitted = JSON.stringify(null);
                        emit('update:value', null);
                        return;
                    }

                    const payload = {
                        id: video.value.id,
                        filename: video.value.filename,
                        extension: video.value.extension,
                        poster_at: clamp(video.value.poster_at, duration()),
                        size: video.value.size === 'original' ? 'original' : Number(video.value.size),
                        quality: video.value.quality,
                        audio: video.value.audio,
                        duration: duration(),
                    };
                    video.value.poster_at = payload.poster_at;
                    lastEmitted = JSON.stringify(payload);
                    emit('update:value', payload);
                }

                function duration() {
                    const fromPlayer = player && Number.isFinite(player.duration) ? player.duration : null;
                    return fromPlayer || knownDuration.value || video.value.duration || null;
                }

                function clamp(seconds, length) {
                    seconds = Math.max(0, Number(seconds) || 0);
                    if (length && length > 0) {
                        seconds = Math.min(seconds, Math.max(0, length - 0.05));
                    }
                    return Math.round(seconds * 100) / 100;
                }

                function previewSrc() {
                    if (!video.value.id || !video.value.extension) {
                        return '';
                    }
                    return '/assets/upload-video/' + video.value.id + '.' + video.value.extension;
                }

                let posterTimer = null;

                function seek() {
                    if (!player) {
                        return;
                    }
                    const at = clamp(video.value.poster_at, duration());
                    const show = () => {
                        player.pause();
                        const capture = () => schedulePoster();
                        if (Math.abs((player.currentTime || 0) - at) < 0.08 && player.readyState >= 2) {
                            capture();
                            return;
                        }
                        player.addEventListener('seeked', capture, { once: true });
                        try {
                            player.currentTime = at;
                        } catch (e) {
                            capture();
                        }
                    };
                    if (player.readyState >= 1) {
                        show();
                    } else {
                        player.addEventListener('loadedmetadata', show, { once: true });
                    }
                }

                function schedulePoster() {
                    clearTimeout(posterTimer);
                    posterTimer = setTimeout(sendPoster, 400);
                }

                function sendPoster() {
                    if (!player || !video.value.id || !player.videoWidth || !props.meta.posterUrl) {
                        return;
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = player.videoWidth;
                    canvas.height = player.videoHeight;
                    const context = canvas.getContext('2d');
                    if (!context) {
                        return;
                    }
                    context.drawImage(player, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob((blob) => {
                        if (!blob || !video.value.id) {
                            return;
                        }
                        const body = new FormData();
                        body.append('poster', blob, 'poster.jpg');
                        fetch(props.meta.posterUrl.replace('__ID__', video.value.id), {
                            method: 'POST',
                            credentials: 'same-origin',
                            headers: {
                                'X-CSRF-TOKEN': Statamic.$config.get('csrfToken'),
                                'X-Requested-With': 'XMLHttpRequest',
                                'Accept': 'application/json',
                            },
                            body,
                        });
                    }, 'image/jpeg', 0.85);
                }

                function onMetadata() {
                    if (player && Number.isFinite(player.duration)) {
                        knownDuration.value = player.duration;
                        video.value.duration = player.duration;
                        video.value.poster_at = clamp(video.value.poster_at, player.duration);
                        emitValue();
                        seek();
                    }
                }

                function setPlayer(element) {
                    player = element;
                    if (element) {
                        seek();
                    }
                }

                function setPoster(raw) {
                    video.value.poster_at = clamp(raw, duration());
                    emitValue();
                    seek();
                }

                async function upload(event) {
                    const file = event.target.files && event.target.files[0];
                    event.target.value = '';
                    if (!file) {
                        return;
                    }

                    error.value = '';
                    busy.value = true;
                    const previous = video.value.id;

                    try {
                        const body = new FormData();
                        body.append('video', file);
                        const response = await fetch(props.meta.uploadUrl, {
                            method: 'POST',
                            credentials: 'same-origin',
                            headers: {
                                'X-CSRF-TOKEN': Statamic.$config.get('csrfToken'),
                                'X-Requested-With': 'XMLHttpRequest',
                                'Accept': 'application/json',
                            },
                            body,
                        });
                        const json = await response.json().catch(() => ({}));
                        if (!response.ok) {
                            throw new Error(json.message || 'Videoen kunne ikke uploades.');
                        }

                        json.size = video.value.size;
                        json.quality = video.value.quality;
                        json.audio = video.value.audio;
                        video.value = read(json);
                        knownDuration.value = video.value.duration;
                        emitValue();

                        if (previous && previous !== json.id) {
                            remove(previous);
                        }
                    } catch (e) {
                        error.value = e.message || 'Videoen kunne ikke uploades.';
                    } finally {
                        busy.value = false;
                    }
                }

                function remove(id) {
                    const url = (props.meta.deleteUrl || '').replace('__ID__', id);
                    if (!url) {
                        return;
                    }
                    fetch(url, {
                        method: 'DELETE',
                        credentials: 'same-origin',
                        headers: {
                            'X-CSRF-TOKEN': Statamic.$config.get('csrfToken'),
                            'X-Requested-With': 'XMLHttpRequest',
                            'Accept': 'application/json',
                        },
                    });
                }

                function clear() {
                    if (video.value.id) {
                        remove(video.value.id);
                    }
                    video.value = empty();
                    knownDuration.value = null;
                    player = null;
                    emitValue();
                }

                function choice(label, control) {
                    return h('label', { class: 'vzl-uv-field' }, [
                        h('span', { class: 'vzl-uv-label' }, label),
                        control,
                    ]);
                }

                return () => {
                    const length = duration();
                    const children = [];

                    if (!video.value.id) {
                        children.push(h('label', { class: 'vzl-uv-pick' }, [
                            h('input', {
                                type: 'file',
                                accept: 'video/mp4,video/webm,video/quicktime,video/ogg,.mp4,.m4v,.webm,.mov,.ogv',
                                class: 'vzl-uv-file',
                                disabled: busy.value,
                                onChange: upload,
                            }),
                            busy.value ? 'Uploader…' : 'Vælg video',
                        ]));
                    } else {
                        children.push(h('video', {
                            key: video.value.id,
                            ref: setPlayer,
                            class: 'vzl-uv-player',
                            src: previewSrc(),
                            controls: true,
                            playsinline: true,
                            preload: 'metadata',
                            onLoadedmetadata: onMetadata,
                        }));

                        children.push(h('p', { class: 'vzl-uv-name' }, video.value.filename));

                        children.push(choice('Poster ved', h('div', { class: 'vzl-uv-poster' }, [
                            h('input', {
                                type: 'range',
                                min: '0',
                                max: String(length && length > 0 ? length : 60),
                                step: '0.1',
                                value: video.value.poster_at,
                                disabled: !length,
                                onInput: (event) => setPoster(event.target.value),
                            }),
                            h('input', {
                                type: 'number',
                                class: 'input-text vzl-uv-seconds',
                                min: '0',
                                max: length && length > 0 ? String(length) : null,
                                step: '0.1',
                                value: video.value.poster_at,
                                onInput: (event) => setPoster(event.target.value),
                                onFocus: () => emit('focus'),
                                onBlur: () => emit('blur'),
                            }),
                            h('span', { class: 'vzl-uv-unit' }, length ? 'sek af ' + length.toFixed(1).replace('.', ',') : 'sek'),
                        ])));

                        children.push(h('p', { class: 'vzl-uv-note' }, 'Poster-billedet gemmes fra det sekund, du vælger.'));

                        children.push(h('div', { class: 'vzl-uv-actions' }, [
                            h('label', { class: 'vzl-uv-link' }, [
                                h('input', {
                                    type: 'file',
                                    accept: 'video/mp4,video/webm,video/quicktime,video/ogg,.mp4,.m4v,.webm,.mov,.ogv',
                                    class: 'vzl-uv-file',
                                    disabled: busy.value,
                                    onChange: upload,
                                }),
                                busy.value ? 'Uploader…' : 'Skift video',
                            ]),
                            h('button', { type: 'button', class: 'vzl-uv-link', onClick: clear }, 'Fjern'),
                        ]));
                    }

                    if (error.value) {
                        children.push(h('p', { class: 'vzl-uv-warn' }, error.value));
                    }

                    return h('div', { class: 'vzl-uv' }, children);
                };
            },
        });
    });
}());
