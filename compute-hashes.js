const crypto = require('crypto');

// Theme bootstrap script (exact content from pos.html lines 5-33)
const themeScript = `            // DyPOS theme bootstrap — runs before any CSS paints to avoid FOUC.
            // Mirrors src/composables/useAppTheme.js persistence contract.
            (function () {
                try {
                    var validTheme = { "light": 1, "dark": 1, "system": 1 };
                    var validAccent = {
                        "royal": 1, "indigo": 1, "violet": 1,
                        "teal": 1, "emerald": 1, "rose": 1,
                    };
                    var validDensity = { "comfortable": 1, "compact": 1 };
                    var mode = localStorage.getItem("DyPOS_theme");
                    var accent = localStorage.getItem("DyPOS_accent");
                    var density = localStorage.getItem("DyPOS_density");
                    var root = document.documentElement;
                    mode = validTheme[mode] ? mode : "system";
                    accent = validAccent[accent] ? accent : "royal";
                    density = validDensity[density] ? density : "comfortable";
                    var dark = mode === "dark";
                    if (mode === "system" && window.matchMedia) {
                        dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                    }
                    root.setAttribute("data-theme", dark ? "dark" : "light");
                    root.setAttribute("data-accent", accent);
                    root.setAttribute("data-density", density);
                    root.style.colorScheme = dark ? "dark" : "light";
                } catch (e) {}
            })();
        `;

// Service worker registration script (exact content from pos.html lines 96-100)
const swScript = `if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/assets/DyPOS/pos/sw.js', { scope: '/' }).catch(function () {});
}
`;

function hash(content) {
  return 'sha256-' + crypto.createHash('sha256').update(content).digest('base64');
}

console.log('Theme script hash:', hash(themeScript));
console.log('SW script hash:', hash(swScript));