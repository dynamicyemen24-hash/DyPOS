<!--
=================================================================================
DyPOS — Login Workspace Panel
RTL-first / Arabic-first / Production Grade
=================================================================================

The workspace column (desktop ≥1101px) sits beside the login form.
It shows the company identity card with a link to the official website.
=================================================================================
-->

<script setup>
import { COMPANY_WEBSITE, COMPANY_WEBSITE_LABEL, APP_NAME } from "@/utils/brand"
import { __ } from "@/utils/translation"
</script>

<template>
  <aside class="dy-login__workspace" :aria-label="__('معلومات الشركة')">
    <div class="dy-login__workspace-card">
      <a
        class="dy-login__workspace-link"
        :href="COMPANY_WEBSITE"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="COMPANY_WEBSITE_LABEL"
      >
        <span class="dy-login__workspace-name">{{ APP_NAME }}</span>
        <span class="dy-login__workspace-tagline">{{ __('منصة نقطة البيع الذكية') }}</span>
      </a>
    </div>
  </aside>
</template>

<style scoped>
.dy-login__workspace-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 20px;
  background: var(--dy-surface);
  border: 1px solid var(--dy-border-soft);
  border-radius: 12px;
  text-align: center;
}

.dy-login__workspace-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: var(--dy-text);
  text-decoration: none;
  transition: color 0.2s ease, transform 0.2s ease;
}

.dy-login__workspace-link:hover,
.dy-login__workspace-link:focus {
  color: var(--dy-accent);
  transform: translateY(-2px);
}

.dy-login__workspace-name {
  font-size: clamp(1.125rem, 2vw, 1.5rem);
  font-weight: 700;
  line-height: 1.2;
}

.dy-login__workspace-tagline {
  font-size: 0.875rem;
  color: var(--dy-text-muted);
  line-height: 1.4;
}

@media (max-width: 1100px) {
  .dy-login__workspace {
    display: none;
  }
}
</style>