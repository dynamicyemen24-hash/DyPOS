export function isRTL() {
  return document.documentElement.dir === 'rtl' ||
    (typeof navigator !== 'undefined' &&
     (navigator.language?.startsWith('ar') || navigator.language?.startsWith('fa')))
}

export function getDirection() {
  return isRTL() ? 'rtl' : 'ltr'
}

export function getChartOptions() {
  return {
    rtl: isRTL(),
    textDirection: isRTL() ? 'rtl' : 'ltr',
  }
}
