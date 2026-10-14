/**
 * @file public/nexus-shadow.js
 * @description Pixel di tracciamento passivo. Inietterà le sessioni fantasma sul ricevitore Edge.
 */

(function() {
    const CONFIG = {
        endpoint: "https://designlabstudio.it/api/pixel/shadow", // TUO DOMINIO
        tenantId: window.NEXUS_TENANT_ID,
        heartbeatMs: 5000 
    };

    let sessionData = {
        startTime: Date.now(),
        maxScroll: 0,
        activeTime: 0,
        lastPulse: Date.now()
    };

    const getFingerprint = () => {
        let fp = localStorage.getItem('_nxs_fp');
        if (!fp) {
            fp = btoa(navigator.userAgent + screen.width + screen.height + new Date().getTimezoneOffset());
            localStorage.setItem('_nxs_fp', fp);
        }
        return fp;
    };

    const trackActivity = () => {
        const now = Date.now();
        if (document.hasFocus()) {
            sessionData.activeTime += (now - sessionData.lastPulse);
        }
        sessionData.lastPulse = now;
        sessionData.maxScroll = Math.max(sessionData.maxScroll, window.scrollY);
    };

    setInterval(trackActivity, 1000);

    const sendPulse = (isFinal = false, capturedEmail = null) => {
        const payload = {
            tid: CONFIG.tenantId,
            fp: getFingerprint(),
            url: window.location.href,
            scroll: sessionData.maxScroll,
            duration: Math.floor(sessionData.activeTime / 1000),
            email: capturedEmail,
            isFinal: isFinal
        };

        if (navigator.sendBeacon) {
            navigator.sendBeacon(CONFIG.endpoint, JSON.stringify(payload));
        } else {
            fetch(CONFIG.endpoint, { method: 'POST', body: JSON.stringify(payload), keepalive: true });
        }
    };

    document.addEventListener('submit', function(e) {
        const emailInput = e.target.querySelector('input[type="email"]');
        if (emailInput && emailInput.value) {
            sendPulse(false, emailInput.value); 
        }
    });

    setInterval(() => sendPulse(false), CONFIG.heartbeatMs);
    window.addEventListener('beforeunload', () => sendPulse(true));
})();