/**
 * DyPOS Custom Icon Registry
 * Replaces Feather Icons with unique, Arabic-aware custom icons
 * All icons are inline SVG - zero external dependencies
 */

import { defineComponent, h, computed } from 'vue'

// Icon name to component mapping
const iconComponents = new Map()

/**
 * Register an icon component
 * @param {string} name - Icon name (kebab-case)
 * @param {string} svgContent - Raw SVG string
 */
export function registerIcon(name, svgContent) {
  const component = defineComponent({
    name: `DyIcon${name.replace(/-/g, '').replace(/\b\w/g, c => c.toUpperCase())}`,
    props: {
      size: { type: [Number, String], default: 20 },
      strokeWidth: { type: [Number, String], default: 2 },
      class: { type: String, default: '' },
      'aria-hidden': { type: Boolean, default: true },
      'aria-label': { type: String, default: '' },
    },
    setup(props, { attrs }) {
      return () => {
        const size = Number(props.size)
        const strokeWidth = Number(props.strokeWidth)

        // Parse SVG content and inject props
        let svg = svgContent
        svg = svg.replace(/stroke-width="[\d.]+"/g, `stroke-width="${strokeWidth}"`)
        svg = svg.replace(/viewBox="[^"]*"/, `viewBox="0 0 24 24"`)
        svg = svg.replace(/<svg /, `<svg width="${size}" height="${size}" `)

        return h('span', {
          class: ['dy-icon', props.class],
          'aria-hidden': props['ariaHidden'] || props['aria-hidden'],
          'aria-label': props['ariaLabel'] || props['aria-label'],
          style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: `${size}px`, height: `${size}px` },
          ...attrs,
        }, svg)
      }
    },
  })

  iconComponents.set(name, component)
  return component
}

/**
 * Get an icon component by name
 * @param {string} name
 * @returns {Component|undefined}
 */
export function getIcon(name) {
  return iconComponents.get(name)
}

/**
 * List all registered icons
 * @returns {string[]}
 */
export function listIcons() {
  return Array.from(iconComponents.keys())
}

/**
 * Dynamic icon component that renders by name
 */
export const DyIcon = defineComponent({
  name: 'DyIcon',
  props: {
    name: { type: String, required: true },
    size: { type: [Number, String], default: 20 },
    strokeWidth: { type: [Number, String], default: 2 },
    class: { type: String, default: '' },
    'aria-label': { type: String, default: '' },
    'aria-hidden': { type: Boolean, default: true },
  },
  setup(props) {
    return () => {
      const component = getIcon(props.name)
      if (!component) {
        console.warn(`[DyPOS Icons] Icon "${props.name}" not found`)
        return h('span', { class: 'dy-icon-missing', style: { width: `${Number(props.size)}px`, height: `${Number(props.size)}px` } }, '?')
      }
      return h(component, {
        size: props.size,
        strokeWidth: props.strokeWidth,
        class: props.class,
        'aria-label': props['ariaLabel'] || props['aria-label'],
        'aria-hidden': props['ariaHidden'] || props['aria-hidden'],
      })
    }
  },
})

// ============================================================================
// RAW SVG CONTENT - All icons embedded as strings (no external deps)
// ============================================================================

const rawIcons = {
  logo: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" stroke-width="1.5"/><path d="M9 12h6M12 9v6" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.15"/></svg>`,
  'logo-full': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" stroke-width="1.5"/><path d="M9 12h6M12 9v6" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.15"/></svg>`,
  'pos-terminal': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" stroke-width="1.5"/><path d="M7 12h10M9 16h6" stroke-width="1.5"/><circle cx="18" cy="6" r="2" fill="currentColor" opacity="0.2"/></svg>`,
  receipt: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M8 10h8M8 14h5"/></svg>`,
  inventory: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/><path d="M12 6v6"/><circle cx="18" cy="6" r="2" fill="currentColor" opacity="0.15"/></svg>`,
  customers: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="12" cy="6" r="2" fill="currentColor" opacity="0.15"/></svg>`,
  reports: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M19 17l-5-5-4 4-3-3-2 2"/><path d="M7 13l3-3 2 2 3-3 4 4"/><circle cx="6" cy="18" r="2" fill="currentColor" opacity="0.15"/></svg>`,
  settings: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>`,
  barcode: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 10h18M3 14h18M3 18h18"/><rect x="3" y="2" width="18" height="20" rx="2"/><path d="M7 22v-4M17 22v-4" stroke-width="1.5"/></svg>`,
  cash: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M8 8h8M8 12h5M8 16h3"/><path d="M16 4v4M20 4v4" stroke-width="1.5"/><circle cx="18" cy="6" r="2" fill="currentColor" opacity="0.15"/></svg>`,
  card: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h12M6 12h8M6 16h5"/><path d="M14 12l3 3 4-4" stroke-width="1.5" stroke="currentColor" opacity="0.6"/><circle cx="18" cy="6" r="2" fill="currentColor" opacity="0.15"/></svg>`,
  user: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/><path d="M12 4v4M12 16v4" stroke-width="1.5"/></svg>`,
  search: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M8 11h2M14 11h2" stroke-width="1.5"/></svg>`,
  menu: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
  close: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  'chevron-left': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`,
  'chevron-right': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`,
  plus: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
  minus: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>`,
  filter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
  'more-vertical': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
  bell: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M12 15v-2M12 9v-2" stroke-width="1.5" stroke="currentColor" opacity="0.5"/></svg>`,
  home: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/><path d="M12 4v5"/><circle cx="12" cy="6" r="2" fill="currentColor" opacity="0.15"/></svg>`,
  eye: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8"/><circle cx="12" cy="12" r="3"/><path d="M12 8v4M12 16v2" stroke-width="1.5"/></svg>`,
  'eye-off': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8"/><path d="M1 1l22 22"/><circle cx="12" cy="12" r="3"/><path d="M12 8v4M12 16v2" stroke-width="1.5"/></svg>`,
  download: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/><path d="M8 21h8" stroke-width="1.5"/></svg>`,
  upload: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/><path d="M8 21h8" stroke-width="1.5"/></svg>`,
  'arrow-left': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`,
  'arrow-right': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  x: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  edit: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5a2.121 2.121 0 0 1 3 3z"/></svg>`,
  trash: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M9 10v9M15 10v9" stroke-width="1.5"/></svg>`,
  share: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="19" r="3"/><path d="M8.59 13.51l-1.59 1.59a2 2 0 0 1-2.83-2.83l6.59-6.59"/><path d="M12 12l1.5-1.5a2 2 0 0 1 2.83 2.83l-6.59 6.59" stroke-width="1.5" opacity="0.6"/></svg>`,
  print: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M10 14v-2M14 14v-2" stroke-width="1.5"/></svg>`,
  lock: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><path d="M12 14v6" stroke-width="1.5"/></svg>`,
  unlock: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><path d="M9 11v-1a3 3 0 1 1 6 0v1" stroke-width="1.5"/><path d="M12 14v6" stroke-width="1.5"/></svg>`,
}

// Register all icons
Object.entries(rawIcons).forEach(([name, svg]) => registerIcon(name, svg))

export { DyIcon, registerIcon, getIcon, listIcons }
export default DyIcon