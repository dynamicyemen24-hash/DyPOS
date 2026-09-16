# Copyright (c) 2025, المنافذ الذكية للبرمجيات (Smart Ports Software)
# For license information, please see license.txt

from datetime import datetime

import frappe

app_name = "DyPOS"
app_title = "POS Next"
app_publisher = "المنافذ الذكية للبرمجيات"
app_description = "نقاط البيع الذكية - نظام نقاط بيع متكامل"
app_icon = "octicon octicon-screen-full"
app_color = "#1E40AF"
app_version = "1.16.0"
app_email = "support@smartports.com"
app_license = "AGPL-3.0"
app_logo_url = "/assets/smart_ports/images/logo.png"
dev_email = "dev@smartports.com"
requirements = []


def before_install():
    pass


def after_install():
    setup_company_branding()
    setup_workspace()
    setup_print_format()
    setup_singles()
    frappe.clear_cache()


def setup_company_branding():
    """Set up company branding for Smart Ports Software"""
    company_name = "المنافذ الذكية للبرمجيات"

    if not frappe.db.exists("Company", company_name):
        frappe.get_doc(
            {
                "doctype": "Company",
                "company_name": company_name,
                "short_name": "SP",
                "default_currency": "SAR",
                "country": "Saudi Arabia",
                "is_group": 0,
                "parent_company": "",
                "create_chart_of_accounts_based_on": "Standard Template",
                "chart_of_accounts": "Standard Chart of Accounts",
                "domain": "Manufacturing",
            }
        ).insert()

    frappe.db.set_value("System Settings", None, "company", company_name)


def setup_workspace():
    """Set up custom workspace for POS Next"""
    if not frappe.db.exists("Workspace", "DyPOS"):
        frappe.get_doc(
            {
                "doctype": "Workspace",
                "name": "DyPOS",
                "label": "المنافذ الذكية POS",
                "module": "POS Next",
                "icon": "octicon octicon-screen-full",
                "type": "Module",
                "pages": [],
                "hidden": 0,
                "public": 1,
                "roles": ["POS User", "POS Manager", "System Manager"],
                "translations": [],
                "order": 0,
                "is_default": 1,
                "category": "Selling",
                "label_en": "DyPOS",
            }
        ).insert()


def setup_print_format():
    """Set up company print format"""
    if not frappe.db.exists("Print Format", "POS Next Receipt"):
        return

    doc = frappe.get_doc("Print Format", "POS Next Receipt")
    doc.html = get_pos_receipt_html()
    doc.save()


def setup_singles():
    """Setup single DocTypes with default values"""
    if not frappe.db.exists("POS Settings"):
        return

    settings = frappe.get_doc("POS Settings")
    if not settings.pos_profile:
        frappe.throw("Please create a POS Profile first")


def get_pos_receipt_html():
    return """
<style>
    @page { size: 80mm auto; margin: 0mm; }
    body {
        font-family: 'Cairo', 'DejaVu Sans', 'Arial', sans-serif;
        width: 80mm; max-width: 80mm; margin: 0 auto; padding: 10px;
        font-size: 11px; line-height: 1.4; direction: rtl;
    }
    .header { text-align: center; border-bottom: 2px solid #1E40AF; padding-bottom: 10px; margin-bottom: 15px; }
    .company-name { font-size: 18px; font-weight: bold; color: #1E40AF; }
    .company-tagline { font-size: 10px; color: #666; }
    .logo { max-width: 60px; margin: 5px auto; }
    .invoice-number { font-size: 14px; font-weight: bold; color: #333; }
    .customer-info { font-size: 10px; color: #555; }
    .divider { border-top: 1px dashed #333; margin: 12px 0; }
    .total-row { font-size: 14px; font-weight: bold; border-top: 2px solid #1E40AF; padding-top: 8px; margin-top: 8px; }
    .footer { border-top: 2px solid #1E40AF; margin-top: 15px; padding-top: 10px; text-align: center; font-size: 10px; color: #666; }
    .text-center { text-align: center; }
    .bold { font-weight: bold; }
</style>

<div class="header">
    <div class="company-name">المنافذ الذكية للبرمجيات</div>
    <div class="company-tagline">Smart Ports Software | نقاط البيع الذكية</div>
</div>

<div class="invoice-number">{{ doc.name }}</div>
<div class="customer-info">{{ doc.customer_name }}</div>

<div class="divider"></div>

{%- for item in doc.items %}
<div style="margin: 8px 0;">
    <div style="display: table; width: 100%;">
        <div style="display: table-cell; text-align: right; width: 60%;">
            <div class="bold">{{ item.item_name }}</div>
            <div style="font-size: 9px; color: #888;">{{ item.qty }} × {{ item.rate }}</div>
        </div>
        <div style="display: table-cell; text-align: left; width: 40%;">
            {{ item.amount }} {{ doc.currency }}
        </div>
    </div>
</div>
{%- endfor %}

<div class="total-row">
    <div class="text-center">المجموع: {{ doc.total }} {{ doc.currency }}</div>
</div>

<div class="divider"></div>

<div class="footer">
    <div>شكراً لتعاملكم مع المنافذ الذكية</div>
    <div>تاريخ: {{ doc.posting_date }}</div>
    <div>{{ doc.company }}</div>
</div>
"""


def after_migrate():
    """Hook that runs after bench migrate"""
    try:
        frappe.reload_doc("DyPOS", "doctype", "pos_settings")
        frappe.reload_doc("DyPOS", "doctype", "pos_profile")
        frappe.reload_doc("DyPOS", "workspace", "DyPOS")
        frappe.clear_cache()
    except Exception as e:
        frappe.log_error(title="POS Next Branding Migration Error", message=str(e))