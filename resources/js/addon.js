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
        Statamic.$callbacks.add('vzlEncodeAssetVideo', encodeAssetVideo);
        document.addEventListener('inertia:navigate', watchPoster);
        watchPoster();
    });
})();
