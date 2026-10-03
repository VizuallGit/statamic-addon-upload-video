(function () {
    'use strict';

    async function encodeAssetVideo(payload) {
        if (!payload || !payload.url || !payload.uploadUrl) {
            return;
        }
        if (!window.VzlUploadVideoShrink || typeof window.VzlUploadVideoShrink.shrink !== 'function') {
            Statamic.$toast.error('Videoen kunne ikke gøres mindre.');
            return;
        }

        try {
            const response = await fetch(payload.url, { credentials: 'same-origin' });
            if (!response.ok) {
                throw new Error('Videoen kunne ikke hentes.');
            }
            const blob = await response.blob();
            const name = payload.filename || 'video.mp4';
            const end = payload.end === null || payload.end === '' || Number(payload.end) <= 0 ? null : Number(payload.end);
            const smaller = await window.VzlUploadVideoShrink.shrink(new File([blob], name, { type: blob.type || 'video/mp4' }), null, {
                audio: payload.audio !== false,
                height: Number(payload.size) === 1080 ? 1080 : 720,
                quality: Number(payload.quality),
                start: Math.max(0, Number(payload.start) || 0),
                end: end,
            });
            const chunkBytes = Math.max(1, Number(payload.chunkBytes) || (1024 * 1024));
            const total = Math.max(1, Math.ceil(smaller.size / chunkBytes));
            let id = '';
            let saved = null;

            for (let index = 0; index < total; index++) {
                const slice = smaller.slice(index * chunkBytes, Math.min(smaller.size, (index + 1) * chunkBytes));
                const body = new FormData();
                body.append('index', String(index));
                body.append('total', String(total));
                body.append('filename', smaller.name);
                body.append('asset', payload.asset || '');
                body.append('replace', payload.replace ? '1' : '0');
                body.append('token', payload.token || '');
                if (id) {
                    body.append('id', id);
                }
                body.append('chunk', slice, smaller.name);
                const uploaded = await fetch(payload.uploadUrl, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'X-CSRF-TOKEN': Statamic.$config.get('csrfToken'),
                        'X-Requested-With': 'XMLHttpRequest',
                        'Accept': 'application/json',
                    },
                    body,
                });
                const json = await uploaded.json().catch(() => ({}));
                if (!uploaded.ok || (!json.id && !json.asset)) {
                    throw new Error(json.message || 'Videoen kunne ikke gemmes.');
                }
                id = json.id || id;
                if (json.asset) {
                    saved = json;
                }
            }

            if (!saved) {
                throw new Error('Videoen kunne ikke gemmes.');
            }

            Statamic.$toast.success('Videoen er gemt (' + (saved.filesize || '') + ').');
            if (saved.edit_url) {
                window.location.assign(saved.edit_url);
            }
        } catch (e) {
            Statamic.$toast.error(e.message || 'Videoen kunne ikke gemmes.');
        }
    }

    Statamic.booting(() => {
        const { h, ref, watch } = window.Vue;

        Statamic.$callbacks.add('vzlEncodeAssetVideo', encodeAssetVideo);

        Statamic.$components.register('upload-video-fieldtype', {
            inheritAttrs: false,
            props: {
                value: { default: null },
                meta: { type: Object, default: () => ({}) },
                config: { type: Object, default: () => ({}) },
            },
            emits: ['update:value', 'focus', 'blur'],
            setup(props, { emit }) {
                const videos = ref(readList(props.value));
                const active = ref(0);
                const busy = ref(false);
                const status = ref('');
                const error = ref('');
                const dragging = ref(false);
                const showBrowser = ref(false);
                const picks = ref([]);
                let player = null;
                let fileInput = null;
                let dragDepth = 0;
                let lastEmitted = null;
                let posterTimer = null;

                watch(() => props.value, (next) => {
                    if (JSON.stringify(next ?? null) === lastEmitted) {
                        return;
                    }
                    videos.value = readList(next);
                    if (active.value >= videos.value.length) {
                        active.value = 0;
                    }
                }, { deep: true });

                function readList(next) {
                    const rows = Array.isArray(next) ? next : (next && typeof next === 'object' ? [next] : []);

                    return rows.map(readOne).filter(Boolean);
                }

                function readOne(next) {
                    if (!next || typeof next !== 'object') {
                        return null;
                    }

                    const asset = typeof next.asset === 'string' && next.asset !== '' ? next.asset : null;
                    const id = typeof next.id === 'string' && next.id !== '' ? next.id : null;

                    if (!asset && !id) {
                        return null;
                    }

                    return {
                        id,
                        asset,
                        filename: next.filename || '',
                        extension: next.extension || '',
                        url: typeof next.url === 'string' ? next.url : '',
                        filesize: typeof next.filesize === 'string' ? next.filesize : '',
                        poster_at: Number(next.poster_at ?? 1),
                        size: next.size == null || next.size === 'original' ? 'original' : Number(next.size),
                        quality: next.quality || 'standard',
                        audio: next.audio !== false && next.audio !== 0 && next.audio !== 'false',
                        duration: next.duration == null ? null : Number(next.duration),
                    };
                }

                function maxFiles() {
                    const set = parseInt(props.meta.maxFiles ?? props.config.max_files, 10);

                    return set >= 1 ? set : 1;
                }

                function allowsUploads() {
                    return props.meta.allowUploads !== false;
                }

                function current() {
                    return videos.value[active.value] || null;
                }

                function emitValue() {
                    const rows = videos.value.map((item) => ({
                        id: item.id,
                        asset: item.asset,
                        filename: item.filename,
                        extension: item.extension,
                        url: item.url || null,
                        filesize: item.filesize || null,
                        poster_at: clamp(item.poster_at, item.duration),
                        size: item.size === 'original' ? 'original' : Number(item.size),
                        quality: item.quality,
                        audio: item.audio,
                        duration: item.duration,
                    }));
                    const outgoing = maxFiles() === 1 ? (rows[0] ?? null) : rows;
                    lastEmitted = JSON.stringify(outgoing);
                    emit('update:value', outgoing);
                }

                function duration() {
                    const item = current();
                    const fromPlayer = player && Number.isFinite(player.duration) ? player.duration : null;

                    return fromPlayer || (item && item.duration) || null;
                }

                function clamp(seconds, length) {
                    seconds = Math.max(0, Number(seconds) || 0);
                    if (length && length > 0) {
                        seconds = Math.min(seconds, Math.max(0, length - 0.05));
                    }
                    return Math.round(seconds * 100) / 100;
                }

                function src(item) {
                    if (!item) {
                        return '';
                    }
                    if (item.url) {
                        return item.url;
                    }
                    if (item.id && item.extension) {
                        return '/assets/upload-video/' + item.id + '.' + item.extension;
                    }
                    return '';
                }

                function seek() {
                    const item = current();
                    if (!player || !item) {
                        return;
                    }
                    const at = clamp(item.poster_at, duration());
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
                    const item = current();
                    if (!player || !item || !player.videoWidth) {
                        return;
                    }
                    const url = item.asset
                        ? props.meta.posterAssetUrl
                        : (item.id && props.meta.posterUrl ? props.meta.posterUrl.replace('__ID__', item.id) : '');
                    if (!url) {
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
                        if (!blob) {
                            return;
                        }
                        const body = new FormData();
                        body.append('poster', blob, 'poster.jpg');
                        if (item.asset) {
                            body.append('asset', item.asset);
                        }
                        fetch(url, {
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
                    const item = current();
                    if (!player || !item || !Number.isFinite(player.duration)) {
                        return;
                    }
                    item.duration = player.duration;
                    item.poster_at = clamp(item.poster_at, player.duration);
                    emitValue();
                    seek();
                }

                function setPlayer(element) {
                    player = element;
                    if (element) {
                        seek();
                    }
                }

                function setPoster(raw) {
                    const item = current();
                    if (!item) {
                        return;
                    }
                    item.poster_at = clamp(raw, duration());
                    emitValue();
                    seek();
                }

                function choose(index) {
                    active.value = index;
                    player = null;
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
                    if (!allowsUploads()) {
                        return;
                    }
                    if (maxFiles() > 1 && videos.value.length >= maxFiles()) {
                        error.value = 'Du kan højst vælge ' + maxFiles() + ' videoer.';
                        return;
                    }

                    error.value = '';
                    busy.value = true;
                    const previous = maxFiles() === 1 ? videos.value[0] : null;
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
                            if (props.meta.container && props.meta.container.id) {
                                body.append('container', props.meta.container.id);
                            }
                            body.append('folder', props.meta.folder && props.meta.folder !== '/' ? props.meta.folder : '');
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
                            if (!response.ok || (!json.id && !json.asset)) {
                                throw new Error(json.message || 'Videoen kunne ikke uploades.');
                            }
                            id = json.id || id;
                            if (json.filename || json.asset) {
                                saved = json;
                            }
                        }

                        if (!saved) {
                            throw new Error('Videoen kunne ikke uploades.');
                        }

                        saved.size = Number(props.meta.size) === 1080 ? 1080 : 720;
                        saved.quality = previous ? previous.quality : 'standard';
                        saved.audio = !withoutAudio;
                        const item = readOne(saved);
                        if (!item) {
                            throw new Error('Videoen kunne ikke uploades.');
                        }
                        if (!item.url && item.id && item.extension) {
                            item.url = '/assets/upload-video/' + item.id + '.' + item.extension;
                        }
                        put(item);

                        if (previous && previous.id && !previous.asset && previous.id !== item.id) {
                            removeFile(previous.id);
                        }
                    } catch (e) {
                        error.value = e.message || 'Videoen kunne ikke uploades.';
                    } finally {
                        busy.value = false;
                        status.value = '';
                    }
                }

                function put(item) {
                    if (maxFiles() === 1) {
                        videos.value = [item];
                        active.value = 0;
                    } else {
                        const rest = videos.value.filter((row) => (item.asset ? row.asset !== item.asset : row.id !== item.id));
                        rest.push(item);
                        videos.value = rest.slice(0, maxFiles());
                        active.value = videos.value.length - 1;
                    }
                    emitValue();
                }

                function removeFile(id) {
                    const url = (props.meta.deleteUrl || '').replace('__ID__', id);
                    if (!url || url.indexOf('__ID__') !== -1) {
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

                function removeAt(index) {
                    const item = videos.value[index];
                    if (item && item.id && !item.asset) {
                        removeFile(item.id);
                    }
                    videos.value = videos.value.filter((_, row) => row !== index);
                    if (active.value >= videos.value.length) {
                        active.value = Math.max(0, videos.value.length - 1);
                    }
                    player = null;
                    emitValue();
                }

                function setFileInput(element) {
                    fileInput = element;
                }

                function openPicker() {
                    if (busy.value || !fileInput || !allowsUploads()) {
                        return;
                    }
                    fileInput.click();
                }

                function openBrowser() {
                    if (busy.value || props.meta.dynamicPending) {
                        return;
                    }
                    if (!props.meta.container) {
                        error.value = 'Vælg en container på feltet.';
                        return;
                    }
                    error.value = '';
                    picks.value = videos.value.map((item) => item.asset).filter(Boolean);
                    showBrowser.value = true;
                    emit('focus');
                }

                function closeBrowser() {
                    showBrowser.value = false;
                    emit('blur');
                }

                async function commitPicks() {
                    if (busy.value) {
                        return;
                    }
                    const ids = picks.value.slice(0, maxFiles());
                    if (ids.length === 0) {
                        videos.value = [];
                        active.value = 0;
                        emitValue();
                        closeBrowser();
                        return;
                    }

                    busy.value = true;
                    error.value = '';
                    try {
                        const response = await fetch(props.meta.assetsUrl, {
                            method: 'POST',
                            credentials: 'same-origin',
                            headers: {
                                'X-CSRF-TOKEN': Statamic.$config.get('csrfToken'),
                                'X-Requested-With': 'XMLHttpRequest',
                                'Accept': 'application/json',
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ assets: ids }),
                        });
                        const json = await response.json().catch(() => []);
                        const rows = Array.isArray(json) ? json : [];
                        const videosOnly = rows.filter((row) => ['mp4', 'm4v', 'webm', 'mov', 'ogv'].indexOf(String(row.extension || '').toLowerCase()) !== -1);
                        if (videosOnly.length === 0) {
                            error.value = 'Vælg en videofil.';
                            return;
                        }
                        const kept = new Map(videos.value.filter((item) => item.asset).map((item) => [item.asset, item]));
                        videos.value = videosOnly.slice(0, maxFiles()).map((row) => {
                            const previous = kept.get(row.id);
                            return readOne({
                                asset: row.id,
                                filename: row.basename || row.filename || '',
                                extension: row.extension,
                                url: row.url,
                                filesize: row.size,
                                poster_at: previous ? previous.poster_at : 1,
                                size: previous ? previous.size : 720,
                                quality: previous ? previous.quality : 'standard',
                                audio: previous ? previous.audio : true,
                                duration: row.duration != null ? row.duration : (previous ? previous.duration : null),
                            });
                        }).filter(Boolean);
                        active.value = 0;
                        emitValue();
                        closeBrowser();
                    } catch (e) {
                        error.value = 'Videoen kunne ikke vælges.';
                    } finally {
                        busy.value = false;
                    }
                }

                function onDragEnter(event) {
                    if (!allowsUploads()) {
                        return;
                    }
                    event.preventDefault();
                    if (busy.value) {
                        return;
                    }
                    dragDepth += 1;
                    dragging.value = true;
                }

                function onDragOver(event) {
                    if (allowsUploads()) {
                        event.preventDefault();
                    }
                }

                function onDragLeave() {
                    dragDepth = Math.max(0, dragDepth - 1);
                    if (dragDepth === 0) {
                        dragging.value = false;
                    }
                }

                function onDrop(event) {
                    if (!allowsUploads()) {
                        return;
                    }
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
                    const currentInstance = window.Vue.getCurrentInstance();
                    const registered = currentInstance && currentInstance.appContext && currentInstance.appContext.components
                        ? currentInstance.appContext.components[name]
                        : null;
                    return registered || null;
                }

                function assetsPieces() {
                    const field = part('assets-fieldtype');
                    if (!field) {
                        return {};
                    }
                    if (field.components) {
                        return field.components;
                    }
                    if (field.__vccOpts && field.__vccOpts.components) {
                        return field.__vccOpts.components;
                    }
                    return {};
                }

                function icon(name, className) {
                    const Icon = part('ui-icon');
                    if (Icon) {
                        return h(Icon, { name, class: className });
                    }
                    return null;
                }

                function selectedText() {
                    const count = videos.value.length;
                    const max = maxFiles();
                    if (typeof __n === 'function') {
                        return __n(':count/:max selected', count, { max: max });
                    }
                    return count + '/' + max;
                }

                function choice(label, control) {
                    return h('label', { class: 'vzl-uv-field' }, [
                        h('span', { class: 'vzl-uv-label' }, label),
                        control,
                    ]);
                }

                return () => {
                    const pieces = assetsPieces();
                    const Button = pieces.Button || part('ui-button');
                    const Stack = pieces.Stack || part('ui-stack');
                    const Selector = pieces.Selector || null;
                    const item = current();
                    const length = duration();
                    const hasFile = videos.value.length > 0;
                    const pending = props.meta.dynamicPending === true;
                    const pickerClass = 'not-[.link-fieldtype_&]:p-2 not-[.link-fieldtype_&]:border border-gray-300 dark:border-gray-700 dark:bg-gray-850 rounded-xl flex flex-row flex-wrap items-center gap-2 sm:gap-3 gap-y-3'
                        + (hasFile ? ' rounded-b-none' : '');
                    const browse = Button
                        ? h(Button, {
                            icon: 'folder-open',
                            text: 'Browse video',
                            class: 'shrink-0',
                            disabled: busy.value || pending,
                            onClick: openBrowser,
                        })
                        : h('button', {
                            type: 'button',
                            class: 'vzl-uv-browse',
                            disabled: busy.value || pending,
                            onClick: openBrowser,
                        }, 'Browse video');
                    const hint = busy.value
                        ? [h('span', { class: 'leading-tight' }, status.value || 'Uploader…')]
                        : [
                            allowsUploads() ? h('span', { class: 'leading-tight' }, 'Træk hertil eller ') : null,
                            allowsUploads() ? h('button', {
                                type: 'button',
                                class: 'text-left underline underline-offset-2 cursor-pointer hover:text-gray-925 dark:hover:text-gray-200',
                                onClick: openPicker,
                            }, 'vælg en fil') : null,
                            allowsUploads() ? h('span', '. ') : null,
                            h('span', { class: 'leading-tight whitespace-nowrap' }, selectedText()),
                        ];
                    const rows = videos.value.map((row, index) => h('div', {
                        key: row.asset || row.id,
                        class: 'flex items-center gap-3 px-3 py-2' + (index > 0 ? ' border-t border-gray-200 dark:border-gray-700' : '') + (maxFiles() > 1 && index === active.value ? ' bg-gray-100 dark:bg-gray-800' : ''),
                        onClick: () => choose(index),
                    }, [
                        icon('video', 'size-5 text-gray-500 shrink-0'),
                        h('span', { class: 'truncate flex-1 text-sm text-gray-800 dark:text-gray-100' }, row.filename),
                        row.filesize ? h('span', { class: 'text-xs text-gray-500 shrink-0' }, row.filesize) : null,
                        h('button', {
                            type: 'button',
                            class: 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 text-sm leading-none px-1',
                            disabled: busy.value,
                            onClick: (event) => {
                                event.stopPropagation();
                                removeAt(index);
                            },
                        }, '×'),
                    ]));
                    const shell = pending
                        ? [h('div', {
                            class: 'w-full rounded-md border border-dashed border-gray-300 dark:border-gray-300 px-4 py-3 text-sm text-gray-700 dark:text-gray-200',
                        }, 'Gem siden, så mappen kan bruges.')]
                        : [
                            allowsUploads() ? h('input', {
                                type: 'file',
                                accept: 'video/mp4,video/webm,video/quicktime,video/ogg,.mp4,.m4v,.webm,.mov,.ogv',
                                class: 'sr-only',
                                ref: setFileInput,
                                disabled: busy.value,
                                onChange: upload,
                            }) : null,
                            dragging.value ? h('div', {
                                class: 'absolute inset-0 z-(--z-index-above) flex gap-2 items-center justify-center bg-white/80 border border-gray-400 border-dashed rounded-lg text-gray-700 pointer-events-none',
                            }, [
                                icon('upload-cloud', 'size-5'),
                                h('span', { class: 'text-sm' }, 'Slip for at uploade'),
                            ]) : null,
                            h('div', { class: pickerClass, 'data-asset-picker': '' }, [
                                browse,
                                h('div', { class: 'text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1 ms-1' }, [
                                    allowsUploads() ? icon('upload-cloud', 'size-5 text-gray-500 me-2') : null,
                                    h('div', { class: 'text-xs' }, hint),
                                ]),
                            ]),
                        ];

                    if (hasFile && !pending) {
                        shell.push(h('div', {
                            class: 'bg-white dark:bg-gray-850 relative border border-gray-300 dark:border-gray-700 border-t-0 rounded-xl rounded-t-none',
                        }, [
                            h('div', rows),
                            item ? h('div', { class: 'p-3 flex flex-col gap-3 border-t border-gray-200 dark:border-gray-700' }, [
                                h('video', {
                                    key: item.asset || item.id,
                                    ref: setPlayer,
                                    class: 'vzl-uv-player',
                                    src: src(item),
                                    controls: true,
                                    playsinline: true,
                                    preload: 'metadata',
                                    onLoadedmetadata: onMetadata,
                                }),
                                choice('Poster ved', h('div', { class: 'vzl-uv-poster' }, [
                                    h('input', {
                                        type: 'range',
                                        min: '0',
                                        max: String(length && length > 0 ? length : 60),
                                        step: '0.1',
                                        value: item.poster_at,
                                        disabled: !length,
                                        onInput: (event) => setPoster(event.target.value),
                                    }),
                                    h('input', {
                                        type: 'number',
                                        class: 'input-text vzl-uv-seconds',
                                        min: '0',
                                        max: length && length > 0 ? String(length) : null,
                                        step: '0.1',
                                        value: item.poster_at,
                                        onInput: (event) => setPoster(event.target.value),
                                        onFocus: () => emit('focus'),
                                        onBlur: () => emit('blur'),
                                    }),
                                    h('span', { class: 'vzl-uv-unit' }, length ? 'sek af ' + length.toFixed(1).replace('.', ',') : 'sek'),
                                ])),
                                h('p', { class: 'vzl-uv-note' }, 'Poster-billedet gemmes fra det sekund, du vælger.'),
                            ]) : null,
                        ]));
                    }

                    const browser = showBrowser.value && Stack && Selector && props.meta.container
                        ? h(Stack, {
                            open: true,
                            inset: '',
                            'show-close-button': false,
                            'onUpdate:open': (open) => {
                                if (!open) {
                                    closeBrowser();
                                }
                            },
                        }, {
                            default: () => h(Selector, {
                                container: props.meta.container,
                                folder: props.meta.folder || '/',
                                restrictFolderNavigation: props.meta.restrict === true,
                                selected: picks.value,
                                maxFiles: maxFiles(),
                                columns: props.meta.columns || [],
                                onSelected: (ids) => {
                                    picks.value = Array.isArray(ids) ? ids.slice(0, maxFiles()) : [];
                                    commitPicks();
                                },
                                onClosed: closeBrowser,
                            }),
                        })
                        : null;

                    return h('div', { class: 'vzl-uv' }, [
                        h('div', {
                            class: '@container relative w-full bg-gray-50 dark:bg-transparent rounded-xl',
                            onDragenter: onDragEnter,
                            onDragover: onDragOver,
                            onDragleave: onDragLeave,
                            onDrop: onDrop,
                        }, shell),
                        h('p', { class: 'vzl-uv-note' }, 'Højst ' + configuredMax().mb + ' MB.'),
                        error.value ? h('p', { class: 'vzl-uv-warn' }, error.value) : null,
                        browser,
                    ]);
                };
            },
        });
    });
}());
