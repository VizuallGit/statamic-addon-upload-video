(function () {
    'use strict';

    let jobStart = 0;

    function ensureStyles() {
        if (document.getElementById('vzl-fit-styles')) {
            return;
        }
        const style = document.createElement('style');
        style.id = 'vzl-fit-styles';
        style.textContent = [
            '.vzl-fit-preview{display:flex;flex-direction:column;gap:.5rem;margin-bottom:1rem}',
            '.vzl-fit-note,.vzl-fit-caption{margin:0}',
            '.vzl-fit-note{font-size:.875rem}',
            '.vzl-fit-caption{font-size:.75rem;opacity:.75}',
            '.vzl-fit-preview canvas{width:100%;max-height:7rem;object-fit:contain;background:#111827;border-radius:.25rem}',
            '#vzl-fit-job{position:fixed;left:1rem;bottom:1rem;z-index:40;width:16rem;padding:.75rem .9rem;border-radius:.5rem;background:#1f2937;color:#f9fafb;box-shadow:0 .5rem 1.5rem rgba(0,0,0,.35);pointer-events:none}',
            '#vzl-fit-job p{margin:0}',
            '#vzl-fit-job .vzl-fit-job-title{font-size:.8125rem}',
            '#vzl-fit-job .vzl-fit-job-meta{margin-top:.35rem;font-size:.75rem;opacity:.75}',
            '#vzl-fit-job .vzl-fit-job-bar{height:.25rem;margin-top:.5rem;border-radius:999px;background:rgba(255,255,255,.15);overflow:hidden}',
            '#vzl-fit-job .vzl-fit-job-bar>span{display:block;height:100%;background:#60a5fa}',
        ].join('');
        document.head.appendChild(style);
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
                detail += ' · cirka ' + left + ' sek';
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

    function editorVideo() {
        return [...document.querySelectorAll('video')].find((node) => !node.closest('.vzl-fit-preview'));
    }

    function registerPreview() {
        const { h, ref, watch } = window.Vue;
        Statamic.$components.register('vzl-fit-video-preview', {
            props: {
                action: { type: Object, default: () => ({}) },
                values: { type: Object, default: () => ({}) },
            },
            setup(props) {
                const canvas = ref(null);
                const caption = ref('');
                let lastStart;
                let lastEnd;

                function showFrame(kind, raw) {
                    const video = editorVideo();
                    const seconds = Math.max(0, Number(raw) || 0);
                    caption.value = kind + ' · ' + seconds + ' sek';
                    if (!video) {
                        return;
                    }
                    const apply = () => {
                        const limit = Number.isFinite(video.duration) && video.duration > 0
                            ? Math.max(0, video.duration - 0.05)
                            : seconds;
                        const time = Math.min(seconds, limit);
                        const draw = () => {
                            const node = canvas.value;
                            if (!node || !video.videoWidth) {
                                return;
                            }
                            const scale = Math.min(1, 480 / video.videoWidth);
                            node.width = Math.max(1, Math.round(video.videoWidth * scale));
                            node.height = Math.max(1, Math.round(video.videoHeight * scale));
                            const context = node.getContext('2d');
                            if (context) {
                                context.drawImage(video, 0, 0, node.width, node.height);
                            }
                        };
                        video.pause();
                        video.addEventListener('seeked', draw, { once: true });
                        if (Math.abs(video.currentTime - time) < 0.05) {
                            draw();
                            return;
                        }
                        try {
                            video.currentTime = time;
                        } catch (e) {
                            draw();
                        }
                    };
                    if (video.readyState >= 1) {
                        apply();
                    } else {
                        video.addEventListener('loadedmetadata', apply, { once: true });
                    }
                }

                watch(() => props.values, (values) => {
                    if (!values) {
                        return;
                    }
                    const start = values.start;
                    const end = values.end;
                    if (String(start ?? '') !== String(lastStart ?? '')) {
                        lastStart = start;
                        lastEnd = end;
                        showFrame('Start', start);
                        return;
                    }
                    if (String(end ?? '') !== String(lastEnd ?? '')) {
                        lastEnd = end;
                        if (end === '' || end == null) {
                            return;
                        }
                        showFrame('Slut', end);
                    }
                }, { deep: true, immediate: true });

                return () => h('div', { class: 'vzl-fit-preview' }, [
                    h('p', { class: 'vzl-fit-note' }, 'Videoen hopper til det sekund, du skriver i start eller slut.'),
                    h('canvas', { ref: canvas }),
                    caption.value ? h('p', { class: 'vzl-fit-caption' }, caption.value) : null,
                ]);
            },
        });
    }

    async function encodeAssetVideo(payload) {
        if (!payload || !payload.url || !payload.uploadUrl) {
            return;
        }
        if (!window.VzlUploadVideoShrink || typeof window.VzlUploadVideoShrink.shrink !== 'function') {
            Statamic.$toast.error('Videoen kunne ikke gøres mindre.');
            return;
        }

        jobStart = Date.now();
        showJob(0, 'Henter videoen…');

        try {
            const response = await fetch(payload.url, { credentials: 'same-origin' });
            if (!response.ok) {
                throw new Error('Videoen kunne ikke hentes.');
            }
            const blob = await response.blob();
            const name = payload.filename || 'video.mp4';
            const end = payload.end === null || payload.end === '' || Number(payload.end) <= 0 ? null : Number(payload.end);
            showJob(0, 'Gør videoen mindre…');
            const smaller = await window.VzlUploadVideoShrink.shrink(new File([blob], name, { type: blob.type || 'video/mp4' }), (progress) => {
                showJob((Number(progress) || 0) * 90, 'Gør videoen mindre…');
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
                showJob(90 + ((index + 1) / total) * 10, 'Uploader…');
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

            showJob(100, 'Videoen er gemt');
            Statamic.$toast.success('Videoen er gemt (' + (saved.filesize || '') + ').');
            window.setTimeout(() => {
                hideJob();
                if (saved.edit_url) {
                    window.location.assign(saved.edit_url);
                }
            }, 700);
        } catch (e) {
            showJob(0, e.message || 'Videoen kunne ikke gemmes.', true);
            Statamic.$toast.error(e.message || 'Videoen kunne ikke gemmes.');
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
            throw new Error(json.message || 'Poster kunne ikke gemmes.');
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
                Statamic.$toast.error(e.message || 'Poster kunne ikke gemmes.');
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
