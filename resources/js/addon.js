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
                const dragging = ref(false);
                let player = null;
                let fileInput = null;
                let dragDepth = 0;
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

                    await storeFile(file);
                }

                function configuredMax() {
                    const mb = Number(props.meta.maxMb);
                    if (mb >= 1) {
                        return { mb: Math.round(mb), bytes: Math.round(mb) * 1024 * 1024 };
                    }
                    const bytes = Number(props.meta.maxBytes);
                    if (bytes >= 1024 * 1024) {
                        return { mb: Math.round(bytes / (1024 * 1024)), bytes };
                    }
                    return { mb: 30, bytes: 30 * 1024 * 1024 };
                }

                async function storeFile(file) {
                    error.value = '';
                    busy.value = true;
                    const previous = video.value.id;
                    const withoutAudio = props.meta.audio === false;
                    const working = 'Gør videoen mindre…';
                    status.value = working;

                    try {
                        const max = configuredMax();
                        const tooBig = 'Videoen må højst være ' + max.mb + ' MB.';
                        if (file.size > max.bytes) {
                            throw new Error(tooBig);
                        }

                        if (!window.VzlUploadVideoShrink || typeof window.VzlUploadVideoShrink.shrink !== 'function') {
                            throw new Error('Videoen kunne ikke gøres mindre.');
                        }

                        const smaller = await window.VzlUploadVideoShrink.shrink(file, (progress) => {
                            status.value = working + ' ' + Math.round((Number(progress) || 0) * 100) + ' %';
                        }, {
                            audio: !withoutAudio,
                            height: Number(props.meta.size) === 1080 ? 1080 : 720,
                            quality: Number(props.meta.quality),
                        });
                        if (smaller.size > max.bytes) {
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
                            body.append('max_bytes', String(max.bytes));
                            body.append('max_token', props.meta.maxToken || '');
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

                        saved.size = Number(props.meta.size) === 1080 ? 1080 : 720;
                        saved.quality = video.value.quality;
                        saved.audio = !withoutAudio;
                        video.value = read(saved);
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

                function setFileInput(element) {
                    fileInput = element;
                }

                function openPicker() {
                    if (busy.value || !fileInput) {
                        return;
                    }
                    fileInput.click();
                }

                function onDragEnter(event) {
                    event.preventDefault();
                    if (busy.value) {
                        return;
                    }
                    dragDepth += 1;
                    dragging.value = true;
                }

                function onDragOver(event) {
                    event.preventDefault();
                }

                function onDragLeave() {
                    dragDepth = Math.max(0, dragDepth - 1);
                    if (dragDepth === 0) {
                        dragging.value = false;
                    }
                }

                function onDrop(event) {
                    event.preventDefault();
                    dragDepth = 0;
                    dragging.value = false;
                    if (busy.value) {
                        return;
                    }
                    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
                    if (file) {
                        storeFile(file);
                    }
                }

                function part(name) {
                    const resolved = window.Vue.resolveComponent(name);
                    if (resolved && resolved !== name) {
                        return resolved;
                    }
                    const current = window.Vue.getCurrentInstance();
                    const registered = current && current.appContext && current.appContext.components
                        ? current.appContext.components[name]
                        : null;
                    return registered || null;
                }

                function icon(name, className) {
                    const Icon = part('ui-icon');
                    if (Icon) {
                        return h(Icon, { name, class: className });
                    }
                    return h('svg', {
                        xmlns: 'http://www.w3.org/2000/svg',
                        viewBox: '0 0 24 24',
                        fill: 'none',
                        stroke: 'currentColor',
                        'stroke-width': '1.5',
                        class: className,
                        'aria-hidden': 'true',
                    }, [
                        h('path', {
                            'stroke-linecap': 'round',
                            'stroke-linejoin': 'round',
                            d: name === 'folder-open'
                                ? 'M3 7.5h6l1.5-2h9.5v11.5a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 16.5z'
                                : 'M12 16V8m0 0 3 3m-3-3-3 3M4 16.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5',
                        }),
                    ]);
                }

                function choice(label, control) {
                    return h('label', { class: 'vzl-uv-field' }, [
                        h('span', { class: 'vzl-uv-label' }, label),
                        control,
                    ]);
                }

                return () => {
                    const length = duration();
                    const Button = part('Button');
                    const hasFile = !!video.value.id;
                    const pickerClass = 'not-[.link-fieldtype_&]:p-2 not-[.link-fieldtype_&]:border border-gray-300 dark:border-gray-700 dark:bg-gray-850 rounded-xl flex flex-col @[22rem]:flex-row gap-2 sm:gap-3 gap-y-3'
                        + (hasFile ? ' rounded-b-none' : '');
                    const choose = Button
                        ? h(Button, {
                            type: 'button',
                            icon: 'folder-open',
                            text: 'Vælg video',
                            class: 'w-full @2xs:w-auto',
                            disabled: busy.value,
                            onClick: openPicker,
                        })
                        : h('button', {
                            type: 'button',
                            class: 'vzl-uv-browse',
                            disabled: busy.value,
                            onClick: openPicker,
                        }, [
                            icon('folder-open', 'size-5'),
                            'Vælg video',
                        ]);
                    const remove = Button
                        ? h(Button, {
                            type: 'button',
                            variant: 'ghost',
                            size: 'sm',
                            icon: 'trash',
                            text: 'Fjern',
                            disabled: busy.value,
                            onClick: clear,
                        })
                        : h('button', {
                            type: 'button',
                            class: 'vzl-uv-link',
                            disabled: busy.value,
                            onClick: clear,
                        }, 'Fjern');
                    const hint = busy.value
                        ? [h('span', { class: 'leading-tight' }, status.value || 'Uploader…')]
                        : [
                            h('span', { class: 'leading-tight' }, 'Træk hertil eller '),
                            h('button', {
                                type: 'button',
                                class: 'text-left underline underline-offset-2 cursor-pointer hover:text-gray-925 dark:hover:text-gray-200',
                                onClick: openPicker,
                            }, 'vælg en fil'),
                            h('span', '. '),
                            h('span', { class: 'leading-tight whitespace-nowrap' }, (hasFile ? '1' : '0') + '/1 valgt'),
                        ];
                    const shell = [
                        h('input', {
                            type: 'file',
                            accept: 'video/mp4,video/webm,video/quicktime,video/ogg,.mp4,.m4v,.webm,.mov,.ogv',
                            class: 'sr-only',
                            ref: setFileInput,
                            disabled: busy.value,
                            onChange: upload,
                        }),
                        dragging.value ? h('div', {
                            class: 'absolute inset-0 z-(--z-index-above) flex gap-2 items-center justify-center bg-white/80 border border-gray-400 border-dashed rounded-lg text-gray-700 pointer-events-none',
                        }, [
                            icon('upload-cloud', 'size-5'),
                            h('span', { class: 'text-sm' }, 'Slip for at uploade'),
                        ]) : null,
                        h('div', { class: pickerClass, 'data-asset-picker': '' }, [
                            choose,
                            h('div', { class: 'text-sm text-gray-600 dark:text-gray-400 flex items-center flex-1 gap-1 ms-1' }, [
                                icon('upload-cloud', 'size-5 text-gray-500 me-2'),
                                h('div', { class: 'text-xs' }, hint),
                            ]),
                        ]),
                    ];

                    if (hasFile) {
                        shell.push(h('div', {
                            class: 'bg-white dark:bg-gray-850 relative border border-gray-300 dark:border-gray-700 border-t-0 rounded-xl rounded-t-none p-3 flex flex-col gap-3',
                        }, [
                            h('video', {
                                key: video.value.id,
                                ref: setPlayer,
                                class: 'vzl-uv-player',
                                src: previewSrc(),
                                controls: true,
                                playsinline: true,
                                preload: 'metadata',
                                onLoadedmetadata: onMetadata,
                            }),
                            h('div', { class: 'flex items-center justify-between gap-2' }, [
                                h('p', { class: 'vzl-uv-name' }, video.value.filename),
                                remove,
                            ]),
                            choice('Poster ved', h('div', { class: 'vzl-uv-poster' }, [
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
                            ])),
                            h('p', { class: 'vzl-uv-note' }, 'Poster-billedet gemmes fra det sekund, du vælger.'),
                        ]));
                    }

                    return h('div', { class: 'vzl-uv' }, [
                        h('div', {
                            class: '@container relative w-full',
                            onDragenter: onDragEnter,
                            onDragover: onDragOver,
                            onDragleave: onDragLeave,
                            onDrop: onDrop,
                        }, shell),
                        h('p', { class: 'vzl-uv-note' }, 'Højst ' + configuredMax().mb + ' MB.'),
                        error.value ? h('p', { class: 'vzl-uv-warn' }, error.value) : null,
                    ]);
                };
            },
        });
    });
}());
