(function () {
    'use strict';

    let jobStart = 0;

    function text(key, replace) {
        const bag = (window.Statamic && Statamic.$config && Statamic.$config.get('vzlFitStrings')) || {};
        let line = bag[key] || key;
        if (replace) {
            Object.keys(replace).forEach((name) => {
                line = line.split(':' + name).join(String(replace[name]));
            });
        }
        return line;
    }

    function ensureStyles() {
        let style = document.getElementById('vzl-fit-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'vzl-fit-styles';
            document.head.appendChild(style);
        }
        style.textContent = [
            '.vzl-fit-preview{display:flex;flex-direction:column;gap:.5rem;margin-bottom:1rem;outline:none;width:100%}',
            '.vzl-fit-note,.vzl-fit-caption{margin:0}',
            '.vzl-fit-note{font-size:.875rem}',
            '.vzl-fit-caption{font-size:.75rem;opacity:.75}',
            '.vzl-fit-stage{position:relative;width:100%;aspect-ratio:16/9;border-radius:.25rem;overflow:hidden;background:#000;cursor:ew-resize;touch-action:none}',
            '.vzl-fit-stage video{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:contain;background:#000;pointer-events:none}',
            '.vzl-fit-track{position:relative;height:2rem;cursor:pointer;touch-action:none}',
            '.vzl-fit-bar{position:absolute;left:0;right:0;top:50%;height:.55rem;margin-top:-.275rem;border-radius:999px;background:#4b5563;overflow:hidden}',
            '.vzl-fit-fill{position:absolute;top:0;bottom:0;background:#3b82f6}',
            '.vzl-fit-handle{position:absolute;top:50%;z-index:2;width:1rem;height:1.6rem;margin:-.8rem 0 0 -.5rem;border-radius:.25rem;background:#e5e7eb;box-shadow:0 0 0 1px #111;cursor:ew-resize;touch-action:none}',
            '.vzl-fit-handle.is-active{background:#fff;box-shadow:0 0 0 2px #3b82f6}',
            '.vzl-fit-poster-handle{position:absolute;top:50%;z-index:3;width:.9rem;height:.9rem;margin:-.45rem 0 0 -.45rem;border-radius:999px;background:#fff;box-shadow:0 0 0 2px #f59e0b;cursor:ew-resize}',
            '.vzl-fit-modes{display:flex;flex-wrap:wrap;gap:.25rem}',
            '.vzl-fit-modes button{flex:0 0 auto;font:inherit;font-size:.6875rem;line-height:1.2;padding:.3rem .55rem;border-radius:.25rem;border:1px solid rgba(255,255,255,.28);background:transparent;color:inherit;cursor:pointer}',
            '.vzl-fit-modes button[aria-pressed=true]{background:rgba(255,255,255,.16)}',
            '#vzl-fit-job{position:fixed;left:1rem;bottom:1rem;z-index:40;width:16rem;padding:.75rem .9rem;border-radius:.5rem;background:#1f2937;color:#f9fafb;box-shadow:0 .5rem 1.5rem rgba(0,0,0,.35);pointer-events:none}',
            '#vzl-fit-job p{margin:0}',
            '#vzl-fit-job .vzl-fit-job-title{font-size:.8125rem}',
            '#vzl-fit-job .vzl-fit-job-meta{margin-top:.35rem;font-size:.75rem;opacity:.75}',
            '#vzl-fit-job .vzl-fit-job-bar{height:.25rem;margin-top:.5rem;border-radius:999px;background:rgba(255,255,255,.15);overflow:hidden}',
            '#vzl-fit-job .vzl-fit-job-bar>span{display:block;height:100%;background:#60a5fa}',
        ].join('');
    }

    function showJob(percent, title, quiet) {
        ensureStyles();
        let node = document.getElementById('vzl-fit-job');
        if (!node) {
            node = document.createElement('div');
            node.id = 'vzl-fit-job';
            node.setAttribute('role', 'status');
            const heading = document.createElement('p');
            heading.className = 'vzl-fit-job-title';
            const bar = document.createElement('div');
            bar.className = 'vzl-fit-job-bar';
            bar.appendChild(document.createElement('span'));
            const meta = document.createElement('p');
            meta.className = 'vzl-fit-job-meta';
            node.append(heading, bar, meta);
            document.body.appendChild(node);
        }
        const amount = Math.max(0, Math.min(100, percent));
        node.querySelector('.vzl-fit-job-title').textContent = title;
        node.querySelector('.vzl-fit-job-bar > span').style.width = amount + '%';
        let detail = quiet ? '' : Math.round(amount) + ' %';
        if (!quiet && amount > 3 && amount < 100) {
            const left = Math.ceil(((Date.now() - jobStart) / 1000) * (100 - amount) / amount);
            if (left >= 1) {
                detail += ' · ' + text('about', { seconds: left });
            }
        }
        node.querySelector('.vzl-fit-job-meta').textContent = detail;
    }

    function hideJob() {
        const node = document.getElementById('vzl-fit-job');
        if (node) {
            node.remove();
        }
    }

    function registerPreview() {
        const { h, ref, watch, onUnmounted } = window.Vue;
        Statamic.$components.register('vzl-fit-video-preview', {
            props: {
                action: { type: Object, default: () => ({}) },
                values: { type: Object, default: () => ({}) },
            },
            setup(props) {
                const caption = ref('');
                const mode = ref('start');
                const duration = ref(0);
                const playhead = ref(0);
                let previewEl = null;
                let sourceObserver = null;
                let lastStart;
                let lastEnd;
                let lastPoster;
                let wheelTarget = null;

                function blankEnd(value) {
                    return value === '' || value == null;
                }

                function captionFor(kind, raw, seconds) {
                    const whole = Math.round(seconds);
                    if (kind === 'poster' && whole === 0) {
                        return text('poster_first');
                    }
                    if (kind === 'end' && blankEnd(raw)) {
                        return text('end_through');
                    }
                    const key = kind === 'end' ? 'end_at' : (kind === 'poster' ? 'poster_at' : 'start_at');
                    return text(key, { seconds: whole });
                }

                function keptStart() {
                    return Math.max(0, Math.round(Number((props.values || {}).start) || 0));
                }

                function keptEnd() {
                    const values = props.values || {};
                    if (blankEnd(values.end)) {
                        return duration.value > 0 ? Math.floor(duration.value) : null;
                    }
                    return Math.max(0, Math.round(Number(values.end) || 0));
                }

                function clampPoster(seconds) {
                    let next = Math.max(keptStart(), Math.round(seconds));
                    const end = keptEnd();
                    if (end !== null) {
                        next = Math.min(end, next);
                    }
                    return next;
                }

                function previewSource() {
                    const given = props.action && props.action.video;
                    return typeof given === 'string' ? given : '';
                }

                function stopSourceWatch() {
                    if (sourceObserver) {
                        sourceObserver.disconnect();
                        sourceObserver = null;
                    }
                }

                function movePreview(node, time) {
                    const limit = Number.isFinite(node.duration) && node.duration > 0
                        ? Math.max(0, node.duration - 0.05)
                        : time;
                    const at = Math.min(Math.max(0, time), limit);
                    playhead.value = at;
                    const remember = () => {
                        if (Number.isFinite(node.duration) && node.duration > 0) {
                            duration.value = node.duration;
                        }
                    };
                    if (node.readyState >= 2 && Math.abs(node.currentTime - at) < 0.04) {
                        remember();
                        return;
                    }
                    node.addEventListener('seeked', remember, { once: true });
                    if (node.readyState < 2) {
                        node.addEventListener('loadeddata', remember, { once: true });
                    }
                    try {
                        if (node.readyState < 2 && Math.abs((node.currentTime || 0) - at) < 0.001) {
                            node.addEventListener('seeked', () => {
                                try {
                                    node.currentTime = at;
                                } catch (e) {
                                    remember();
                                }
                            }, { once: true });
                            node.currentTime = Math.min(limit, at + 0.04);
                            return;
                        }
                        node.currentTime = at;
                    } catch (e) {
                        remember();
                    }
                }

                function loadPreview(node, time) {
                    const src = previewSource();
                    if (!src) {
                        if (!sourceObserver) {
                            sourceObserver = new MutationObserver(() => {
                                if (previewSource() && previewEl) {
                                    stopSourceWatch();
                                    loadPreview(previewEl, playhead.value);
                                }
                            });
                            sourceObserver.observe(document.body, {
                                childList: true,
                                subtree: true,
                                attributes: true,
                                attributeFilter: ['src'],
                            });
                        }
                        return;
                    }
                    stopSourceWatch();
                    if (node.getAttribute('src') !== src) {
                        node.preload = 'auto';
                        node.addEventListener('loadedmetadata', () => {
                            if (Number.isFinite(node.duration) && node.duration > 0) {
                                duration.value = node.duration;
                            }
                            const values = props.values || {};
                            const at = mode.value === 'end' && blankEnd(values.end)
                                ? Math.max(0, node.duration - 0.05)
                                : time;
                            movePreview(node, at);
                        }, { once: true });
                        node.src = src;
                        return;
                    }
                    movePreview(node, time);
                }

                function showFrame(kind, raw) {
                    const emptyEnd = kind === 'end' && blankEnd(raw);
                    const seconds = emptyEnd ? (duration.value || 0) : Math.max(0, Number(raw) || 0);
                    caption.value = captionFor(kind, raw, seconds);
                    playhead.value = seconds;
                    if (!previewEl) {
                        return;
                    }
                    previewEl.pause();
                    loadPreview(previewEl, seconds);
                }

                function attachPreview(el) {
                    if (el === previewEl) {
                        return;
                    }
                    previewEl = el;
                    if (!el) {
                        return;
                    }
                    el.muted = true;
                    el.playsInline = true;
                    el.preload = 'auto';
                    const values = props.values || {};
                    if (mode.value === 'end') {
                        showFrame('end', blankEnd(values.end) ? '' : values.end);
                        return;
                    }
                    if (mode.value === 'poster') {
                        showFrame('poster', clampPoster(Number(values.poster) || 0));
                        return;
                    }
                    showFrame('start', values.start || 0);
                }

                function currentSeconds() {
                    const values = props.values || {};
                    if (mode.value === 'end') {
                        return blankEnd(values.end) ? (duration.value || 0) : (Number(values.end) || 0);
                    }
                    if (mode.value === 'poster') {
                        return Number(values.poster) || 0;
                    }
                    return Number(values.start) || 0;
                }

                function commit(raw) {
                    const values = props.values;
                    if (!values) {
                        return;
                    }
                    const dur = duration.value;
                    let seconds = Math.round(Math.max(0, raw));
                    if (dur > 0) {
                        seconds = Math.min(seconds, Math.floor(dur));
                    }
                    if (mode.value === 'start') {
                        const end = blankEnd(values.end) ? null : Number(values.end);
                        if (end !== null && seconds >= end) {
                            seconds = Math.max(0, end - 1);
                        }
                        if (dur > 0) {
                            seconds = Math.min(seconds, Math.max(0, Math.floor(dur) - 1));
                        }
                        values.start = seconds;
                        if ((Number(values.poster) || 0) < seconds) {
                            values.poster = seconds;
                        }
                        showFrame('start', seconds);
                        return;
                    }
                    if (mode.value === 'end') {
                        const start = Math.max(0, Number(values.start) || 0);
                        if (dur > 0 && seconds >= Math.floor(dur)) {
                            values.end = null;
                            const poster = Number(values.poster) || 0;
                            if (poster < start) {
                                values.poster = start;
                            }
                            showFrame('end', '');
                            return;
                        }
                        values.end = Math.max(start + 1, seconds);
                        const poster = Number(values.poster) || 0;
                        if (poster > values.end) {
                            values.poster = values.end;
                        }
                        if (poster < start) {
                            values.poster = start;
                        }
                        showFrame('end', values.end);
                        return;
                    }
                    values.poster = clampPoster(seconds);
                    showFrame('poster', values.poster);
                }

                function selectMode(next) {
                    mode.value = next;
                    const values = props.values || {};
                    if (next === 'start') {
                        showFrame('start', values.start);
                        return;
                    }
                    if (next === 'end') {
                        showFrame('end', blankEnd(values.end) ? '' : values.end);
                        return;
                    }
                    const poster = clampPoster(Number(values.poster) || 0);
                    if ((Number(values.poster) || 0) !== poster) {
                        values.poster = poster;
                    }
                    showFrame('poster', poster);
                }

                function pointerRatio(surface, pointer) {
                    const box = surface.getBoundingClientRect();
                    return Math.min(1, Math.max(0, box.width ? (pointer.clientX - box.left) / box.width : 0));
                }

                function showActive(which) {
                    const values = props.values || {};
                    if (which === 'end') {
                        showFrame('end', blankEnd(values.end) ? '' : values.end);
                        return;
                    }
                    if (which === 'poster') {
                        showFrame('poster', clampPoster(Number(values.poster) || 0));
                        return;
                    }
                    showFrame('start', values.start || 0);
                }

                function knownDuration() {
                    if (duration.value > 0) {
                        return duration.value;
                    }
                    const node = previewEl;
                    if (node && Number.isFinite(node.duration) && node.duration > 0) {
                        duration.value = node.duration;
                        return node.duration;
                    }
                    return 0;
                }

                function beginDrag(which, surface, event, moveNow) {
                    if (event.button != null && event.button !== 0 || !surface) {
                        return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    mode.value = which;
                    if (surface.setPointerCapture && event.pointerId != null) {
                        try {
                            surface.setPointerCapture(event.pointerId);
                        } catch (e) {
                            /* the track still receives the move events */
                        }
                    }
                    const root = surface.closest('.vzl-fit-preview');
                    if (root) {
                        root.focus({ preventScroll: true });
                    }
                    if (!moveNow) {
                        showActive(which);
                    }
                    const apply = (pointer) => {
                        const dur = knownDuration();
                        if (dur > 0) {
                            commit(pointerRatio(surface, pointer) * dur);
                        }
                    };
                    if (moveNow) {
                        apply(event);
                    }
                    const startX = event.clientX;
                    let moved = moveNow;
                    const move = (pointer) => {
                        if (!moved && Math.abs(pointer.clientX - startX) < 3) {
                            return;
                        }
                        moved = true;
                        apply(pointer);
                    };
                    const up = () => {
                        window.removeEventListener('pointermove', move);
                        window.removeEventListener('pointerup', up);
                    };
                    window.addEventListener('pointermove', move);
                    window.addEventListener('pointerup', up);
                }

                function onTrack(event) {
                    if (event.target.closest && event.target.closest('.vzl-fit-handle, .vzl-fit-poster-handle')) {
                        return;
                    }
                    const surface = event.currentTarget;
                    let which = mode.value === 'poster' ? 'poster' : 'start';
                    if (which !== 'poster' && duration.value > 0) {
                        const ratio = pointerRatio(surface, event);
                        const values = props.values || {};
                        const startAt = Math.max(0, Number(values.start) || 0);
                        const endAt = blankEnd(values.end) ? duration.value : Math.max(startAt, Number(values.end) || 0);
                        which = Math.abs(ratio * duration.value - startAt) <= Math.abs(ratio * duration.value - endAt) ? 'start' : 'end';
                    }
                    beginDrag(which, surface, event, true);
                }

                function onWheel(event) {
                    event.preventDefault();
                    const delta = event.deltaY || event.deltaX;
                    if (!delta) {
                        return;
                    }
                    const step = (delta > 0 ? 1 : -1) * (event.shiftKey ? 10 : 1);
                    commit(currentSeconds() + step);
                }

                function onKey(event) {
                    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
                        return;
                    }
                    event.preventDefault();
                    const step = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 10 : 1);
                    commit(currentSeconds() + step);
                }

                function setRoot(el) {
                    if (wheelTarget) {
                        wheelTarget.removeEventListener('wheel', onWheel);
                    }
                    wheelTarget = el;
                    if (el) {
                        el.addEventListener('wheel', onWheel, { passive: false });
                    }
                }

                function modeButton(id, label) {
                    return h('button', {
                        type: 'button',
                        'aria-pressed': mode.value === id ? 'true' : 'false',
                        onClick: () => selectMode(id),
                    }, label);
                }

                if (typeof onUnmounted === 'function') {
                    onUnmounted(() => stopSourceWatch());
                }

                watch(() => props.values, (values) => {
                    if (!values) {
                        return;
                    }
                    const start = values.start;
                    const end = values.end;
                    const poster = values.poster;
                    if (String(start ?? '') !== String(lastStart ?? '')) {
                        lastStart = start;
                        lastEnd = end;
                        lastPoster = poster;
                        mode.value = 'start';
                        showFrame('start', start);
                        return;
                    }
                    if (String(end ?? '') !== String(lastEnd ?? '')) {
                        lastEnd = end;
                        lastPoster = poster;
                        mode.value = 'end';
                        showFrame('end', blankEnd(end) ? '' : end);
                        return;
                    }
                    if (String(poster ?? '') !== String(lastPoster ?? '')) {
                        const firstPoster = lastPoster === undefined;
                        lastPoster = poster;
                        if (firstPoster) {
                            return;
                        }
                        mode.value = 'poster';
                        showFrame('poster', poster);
                    }
                }, { deep: true, immediate: true });

                return () => {
                    const dur = duration.value;
                    const values = props.values || {};
                    const startAt = Math.max(0, Number(values.start) || 0);
                    const endAt = blankEnd(values.end) ? dur : Math.max(startAt, Number(values.end) || 0);
                    const startPct = dur > 0 ? Math.min(100, (startAt / dur) * 100) : 0;
                    const endPct = dur > 0 ? Math.min(100, (endAt / dur) * 100) : 100;
                    const posterAt = clampPoster(Number(values.poster) || 0);
                    const posterPct = dur > 0 ? Math.min(endPct, Math.max(startPct, (posterAt / dur) * 100)) : 0;
                    const handle = (which, pct) => h('i', {
                        class: ['vzl-fit-handle', mode.value === which ? 'is-active' : ''],
                        style: { left: pct + '%' },
                        onPointerdown: (event) => beginDrag(which, event.currentTarget.closest('.vzl-fit-track'), event, true),
                    });

                    return h('div', {
                        class: 'vzl-fit-preview',
                        tabindex: '0',
                        ref: setRoot,
                        onKeydown: onKey,
                    }, [
                        h('p', { class: 'vzl-fit-note' }, text('choose_frame')),
                        h('div', {
                            class: 'vzl-fit-stage',
                            onPointerdown: (event) => beginDrag(mode.value === 'poster' ? 'poster' : (mode.value || 'start'), event.currentTarget, event, true),
                        }, [
                            h('video', {
                                src: previewSource() || undefined,
                                poster: (props.action && props.action.poster) || undefined,
                                muted: true,
                                playsinline: true,
                                preload: 'auto',
                                ref: attachPreview,
                                onLoadedmetadata: (event) => {
                                    const node = event.target;
                                    if (Number.isFinite(node.duration) && node.duration > 0) {
                                        duration.value = node.duration;
                                    }
                                },
                            }),
                        ]),
                        h('div', { class: 'vzl-fit-track', onPointerdown: onTrack }, [
                            h('span', { class: 'vzl-fit-bar' }, [
                                h('i', {
                                    class: 'vzl-fit-fill',
                                    style: {
                                        left: startPct + '%',
                                        width: Math.max(0, endPct - startPct) + '%',
                                    },
                                }),
                            ]),
                            handle('start', startPct),
                            handle('end', endPct),
                            mode.value === 'poster' ? h('i', {
                                class: 'vzl-fit-poster-handle',
                                style: { left: posterPct + '%' },
                                onPointerdown: (event) => beginDrag('poster', event.currentTarget.closest('.vzl-fit-track'), event, true),
                            }) : null,
                        ]),
                        h('div', { class: 'vzl-fit-modes' }, [
                            modeButton('poster', text('poster')),
                        ]),
                        caption.value ? h('p', { class: 'vzl-fit-caption' }, caption.value) : null,
                    ]);
                };
            },
        });
    }

    function grabFrame(blob, seconds) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(blob);
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.preload = 'auto';
            video.hidden = true;
            video.dataset.vzlGrab = '1';
            video.src = url;
            document.body.appendChild(video);
            let settled = false;
            const finish = (error, frame) => {
                if (settled) {
                    return;
                }
                settled = true;
                URL.revokeObjectURL(url);
                video.remove();
                if (error) {
                    reject(error);
                    return;
                }
                resolve(frame);
            };
            const draw = () => {
                const width = video.videoWidth;
                const height = video.videoHeight;
                if (!width || !height) {
                    finish(new Error(text('poster_make_failed')));
                    return;
                }
                const node = document.createElement('canvas');
                node.width = width;
                node.height = height;
                const context = node.getContext('2d');
                if (!context) {
                    finish(new Error(text('poster_make_failed')));
                    return;
                }
                context.drawImage(video, 0, 0, width, height);
                node.toBlob((frame) => {
                    if (!frame) {
                        finish(new Error(text('poster_make_failed')));
                        return;
                    }
                    finish(null, frame);
                }, 'image/jpeg', 0.85);
            };
            video.addEventListener('error', () => finish(new Error(text('poster_make_failed'))), { once: true });
            video.addEventListener('loadeddata', () => {
                const limit = Number.isFinite(video.duration) && video.duration > 0
                    ? Math.max(0, video.duration - 0.05)
                    : 0;
                const time = Math.min(Math.max(0, Number(seconds) || 0), limit);
                if (time < 0.05) {
                    draw();
                    return;
                }
                video.addEventListener('seeked', draw, { once: true });
                try {
                    video.currentTime = time;
                } catch (e) {
                    draw();
                }
            }, { once: true });
        });
    }

    async function uploadPoster(assetId, blob) {
        const cp = String(Statamic.$config.get('cpUrl') || '').replace(/\/$/, '');
        const body = new FormData();
        body.append('asset', assetId);
        body.append('overwrite', '1');
        body.append('poster', blob, 'poster.jpg');
        const saved = await fetch(cp + '/upload-video/poster', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'X-CSRF-TOKEN': Statamic.$config.get('csrfToken'),
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json',
            },
            body,
        });
        if (!saved.ok) {
            const json = await saved.json().catch(() => ({}));
            throw new Error(json.message || text('poster_failed'));
        }
    }

    async function encodeAssetVideo(payload) {
        if (!payload || !payload.url || !payload.uploadUrl) {
            return;
        }
        if (!window.VzlUploadVideoShrink || typeof window.VzlUploadVideoShrink.shrink !== 'function') {
            Statamic.$toast.error(text('could_not_shrink'));
            return;
        }

        jobStart = Date.now();
        showJob(0, text('fetching'));

        try {
            const response = await fetch(payload.url, { credentials: 'same-origin' });
            if (!response.ok) {
                throw new Error(text('could_not_fetch'));
            }
            const blob = await response.blob();
            const posterTask = grabFrame(blob, payload.poster).catch((error) => error);
            const name = payload.filename || 'video.mp4';
            const end = payload.end === null || payload.end === '' || Number(payload.end) <= 0 ? null : Number(payload.end);
            showJob(0, text('shrinking'));
            const smaller = await window.VzlUploadVideoShrink.shrink(new File([blob], name, { type: blob.type || 'video/mp4' }), (progress) => {
                showJob((Number(progress) || 0) * 90, text('shrinking'));
            }, {
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
                showJob(90 + ((index + 1) / total) * 10, text('uploading'));
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
                    throw new Error(json.message || text('could_not_save'));
                }
                id = json.id || id;
                if (json.asset) {
                    saved = json;
                }
            }

            if (!saved) {
                throw new Error(text('could_not_save'));
            }

            const posterBlob = await posterTask;
            if (posterBlob instanceof Blob && saved.asset) {
                showJob(100, text('saving_image'));
                try {
                    await uploadPoster(saved.asset, posterBlob);
                } catch (error) {
                    Statamic.$toast.error(error.message || text('poster_failed'));
                }
            } else if (posterBlob instanceof Error) {
                Statamic.$toast.error(posterBlob.message || text('poster_failed'));
            }

            showJob(100, text('saved'));
            Statamic.$toast.success(text('saved_size', { size: saved.filesize || '' }));
            window.setTimeout(() => {
                hideJob();
                if (saved.edit_url) {
                    window.location.assign(saved.edit_url);
                }
            }, 700);
        } catch (e) {
            showJob(0, e.message || text('could_not_save'), true);
            Statamic.$toast.error(e.message || text('could_not_save'));
            window.setTimeout(hideJob, 4000);
        }
    }

    function assetIdFromLocation() {
        const path = decodeURIComponent(window.location.pathname);
        const mark = '/assets/browse/';
        const at = path.indexOf(mark);
        if (at < 0 || !path.endsWith('/edit')) {
            return null;
        }
        const rest = path.slice(at + mark.length, -'/edit'.length);
        const slash = rest.indexOf('/');
        if (slash < 0) {
            return null;
        }
        const container = rest.slice(0, slash);
        const file = rest.slice(slash + 1);
        if (!container || !file) {
            return null;
        }
        return container + '::' + file;
    }

    function posterUrlFrom(src) {
        const url = new URL(src, window.location.origin);
        url.pathname = url.pathname.replace(/\.[^.]+$/, '.poster.jpg');
        url.search = '';
        url.hash = '';
        return url.toString();
    }

    function whenFirstFrame(video) {
        return new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) {
                    return;
                }
                settled = true;
                resolve();
            };
            const seek = () => {
                if (video.videoWidth > 0 && video.currentTime === 0) {
                    finish();
                    return;
                }
                const onSeeked = () => {
                    video.removeEventListener('seeked', onSeeked);
                    finish();
                };
                video.addEventListener('seeked', onSeeked);
                video.pause();
                if (typeof video.requestVideoFrameCallback === 'function') {
                    video.requestVideoFrameCallback(() => finish());
                }
                try {
                    video.currentTime = 0;
                } catch (e) {
                    video.removeEventListener('seeked', onSeeked);
                    finish();
                }
            };
            if (video.readyState >= 2) {
                seek();
            } else {
                video.addEventListener('loadeddata', seek, { once: true });
            }
        });
    }

    function frameBlob(video) {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) {
            return Promise.resolve(null);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
            return Promise.resolve(null);
        }
        context.drawImage(video, 0, 0, width, height);
        return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85));
    }

    async function savePoster(video, assetId) {
        const src = video.currentSrc || video.src;
        if (!src) {
            return;
        }
        let source;
        try {
            source = new URL(src, window.location.origin);
        } catch (e) {
            return;
        }
        if (source.origin !== window.location.origin) {
            return;
        }
        const existing = await fetch(posterUrlFrom(src), { method: 'HEAD', credentials: 'same-origin' }).catch(() => null);
        if (existing && existing.ok) {
            return;
        }
        await whenFirstFrame(video);
        const blob = await frameBlob(video);
        if (!blob) {
            return;
        }
        const cp = String(Statamic.$config.get('cpUrl') || '').replace(/\/$/, '');
        const body = new FormData();
        body.append('asset', assetId);
        body.append('poster', blob, 'poster.jpg');
        const saved = await fetch(cp + '/upload-video/poster', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'X-CSRF-TOKEN': Statamic.$config.get('csrfToken'),
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json',
            },
            body,
        });
        if (!saved.ok) {
            const json = await saved.json().catch(() => ({}));
            throw new Error(json.message || text('poster_failed'));
        }
    }

    let posterObserver = null;
    let posterTimer = null;

    function stopPosterWatch() {
        if (posterObserver) {
            posterObserver.disconnect();
            posterObserver = null;
        }
        if (posterTimer) {
            clearTimeout(posterTimer);
            posterTimer = null;
        }
    }

    function watchPoster() {
        stopPosterWatch();
        const assetId = assetIdFromLocation();
        if (!assetId) {
            return;
        }
        const filename = assetId.slice(assetId.indexOf('::') + 2).split('/').pop();

        const stop = () => {
            stopPosterWatch();
        };

        const found = () => {
            const video = [...document.querySelectorAll('video')].find((node) => {
                const src = node.currentSrc || node.src || '';
                return filename !== '' && decodeURIComponent(src).includes(filename);
            });
            if (!video || video.dataset.vzlPoster === assetId) {
                return Boolean(video);
            }
            video.dataset.vzlPoster = assetId;
            stop();
            savePoster(video, assetId).catch((e) => {
                Statamic.$toast.error(e.message || text('poster_failed'));
            });
            return true;
        };

        if (found()) {
            return;
        }

        posterObserver = new MutationObserver(() => {
            found();
        });
        posterObserver.observe(document.body, { childList: true, subtree: true });
        posterTimer = setTimeout(stop, 8000);
    }

    Statamic.booting(() => {
        ensureStyles();
        registerPreview();
        Statamic.$callbacks.add('vzlEncodeAssetVideo', encodeAssetVideo);
        document.addEventListener('inertia:navigate', watchPoster);
        watchPoster();
    });
})();
