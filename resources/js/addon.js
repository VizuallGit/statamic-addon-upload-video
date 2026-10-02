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
                const status = ref('');
                const error = ref('');
                const knownDuration = ref(video.value.duration);
                const mute = ref(video.value.audio === false);
                let player = null;
                let lastEmitted = null;

                watch(() => props.value, (next) => {
                    if (JSON.stringify(next ?? null) === lastEmitted) {
                        return;
                    }
                    video.value = read(next);
                    knownDuration.value = video.value.duration;
                    if (video.value.id) {
                        mute.value = video.value.audio === false;
                    }
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

                    await storeFile(file, mute.value);
                }

                async function setMute(withoutAudio) {
                    if (busy.value) {
                        return;
                    }

                    error.value = '';

                    if (!video.value.id) {
                        mute.value = withoutAudio;
                        return;
                    }

                    if (withoutAudio === (video.value.audio === false)) {
                        return;
                    }

                    if (!withoutAudio) {
                        error.value = 'Lyden er fjernet. Vælg videoen igen, hvis den skal med.';
                        return;
                    }

                    try {
                        const response = await fetch(previewSrc(), { credentials: 'same-origin' });
                        if (!response.ok) {
                            throw new Error('Videoen kunne ikke hentes.');
                        }
                        const blob = await response.blob();
                        const name = video.value.filename || 'video.mp4';
                        await storeFile(new File([blob], name, { type: blob.type || 'video/mp4' }), true);
                    } catch (e) {
                        if (!error.value) {
                            error.value = e.message || 'Lyden kunne ikke fjernes.';
                        }
                    }
                }

                async function storeFile(file, withoutAudio) {
                    error.value = '';
                    busy.value = true;
                    const previous = video.value.id;
                    const working = withoutAudio && previous ? 'Fjerner lyden…' : 'Gør videoen mindre…';
                    status.value = working;

                    try {
                        const maxBytes = Number(props.meta.maxBytes) || (60 * 1024 * 1024);
                        const maxMb = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
                        const tooBig = 'Videoen må højst være ' + maxMb + ' MB.';
                        if (file.size > maxBytes) {
                            throw new Error(tooBig);
                        }

                        if (!window.VzlUploadVideoShrink || typeof window.VzlUploadVideoShrink.shrink !== 'function') {
                            throw new Error('Videoen kunne ikke gøres mindre.');
                        }

                        const smaller = await window.VzlUploadVideoShrink.shrink(file, (progress) => {
                            status.value = working + ' ' + Math.round((Number(progress) || 0) * 100) + ' %';
                        }, { audio: !withoutAudio });
                        if (smaller.size > maxBytes) {
                            throw new Error(tooBig);
                        }
                        const chunkBytes = Math.max(1, Number(props.meta.chunkBytes) || (1024 * 1024));
                        const total = Math.max(1, Math.ceil(smaller.size / chunkBytes));
                        let id = '';
                        let saved = null;

                        for (let index = 0; index < total; index++) {
                            status.value = total > 1 ? ('Del ' + (index + 1) + ' af ' + total) : 'Uploader…';
                            const slice = smaller.slice(index * chunkBytes, Math.min(smaller.size, (index + 1) * chunkBytes));
                            const body = new FormData();
                            body.append('index', String(index));
                            body.append('total', String(total));
                            body.append('filename', smaller.name);
                            if (id) {
                                body.append('id', id);
                            }
                            body.append('chunk', slice, smaller.name);
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
                            if (!response.ok || !json.id) {
                                throw new Error(json.message || 'Videoen kunne ikke uploades.');
                            }
                            id = json.id;
                            if (json.filename) {
                                saved = json;
                            }
                        }

                        if (!saved) {
                            throw new Error('Videoen kunne ikke uploades.');
                        }

                        saved.size = video.value.size;
                        saved.quality = video.value.quality;
                        saved.audio = !withoutAudio;
                        video.value = read(saved);
                        mute.value = withoutAudio;
                        knownDuration.value = video.value.duration;
                        emitValue();

                        if (previous && previous !== saved.id) {
                            remove(previous);
                        }
                    } catch (e) {
                        error.value = e.message || 'Videoen kunne ikke uploades.';
                    } finally {
                        busy.value = false;
                        status.value = '';
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

                function soundButton(label, withoutAudio) {
                    const active = mute.value === withoutAudio;
                    return h('button', {
                        type: 'button',
                        class: 'vzl-uv-audio-btn' + (active ? ' is-active' : ''),
                        disabled: busy.value,
                        onClick: () => setMute(withoutAudio),
                    }, label);
                }

                return () => {
                    const length = duration();
                    const children = [];

                    children.push(h('div', { class: 'vzl-uv-audio' }, [
                        soundButton('Med lyd', false),
                        soundButton('Uden lyd', true),
                    ]));

                    if (!video.value.id) {
                        children.push(h('label', { class: 'vzl-uv-pick' }, [
                            h('input', {
                                type: 'file',
                                accept: 'video/mp4,video/webm,video/quicktime,video/ogg,.mp4,.m4v,.webm,.mov,.ogv',
                                class: 'vzl-uv-file',
                                disabled: busy.value,
                                onChange: upload,
                            }),
                            busy.value ? (status.value || 'Uploader…') : 'Vælg video',
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
                                busy.value ? (status.value || 'Uploader…') : 'Skift video',
                            ]),
                            h('button', { type: 'button', class: 'vzl-uv-link', onClick: clear }, 'Fjern'),
                        ]));
                    }

                    const maxMb = Math.max(1, Math.round((Number(props.meta.maxBytes) || (60 * 1024 * 1024)) / (1024 * 1024)));
                    children.push(h('p', { class: 'vzl-uv-note' }, 'Højst ' + maxMb + ' MB. Videoen gemmes i højst 720p og lav kvalitet.'));

                    if (error.value) {
                        children.push(h('p', { class: 'vzl-uv-warn' }, error.value));
                    }

                    return h('div', { class: 'vzl-uv' }, children);
                };
            },
        });
    });
}());
