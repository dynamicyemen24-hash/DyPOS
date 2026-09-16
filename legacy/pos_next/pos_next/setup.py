# Copyright (c) 2025, المنافذ الذكية للبرمجيات
# For license information, please see license.txt

import frappe


def after_install():
    """Post-installation setup"""
    setup_company()
    setup_roles()
    setup_print_formats()
    setup_workspace()
    setup_notifications()
    setup_home_page()
    frappe.clear_cache()


def setup_company():
    """Create default company"""
    if not frappe.db.exists("Company", "المنافذ الذكية للبرمجيات"):
        company = frappe.get_doc(
            {
                "doctype": "Company",
                "company_name": "المنافذ الذكية للبرمجيات",
                "short_name": "SP",
                "default_currency": "SAR",
                "country": "Saudi Arabia",
                "is_group": 0,
                "create_chart_of_accounts_based_on": "Standard Template",
                "chart_of_accounts": "Standard Chart of Accounts",
            }
        )
        company.insert(ignore_permissions=True)


def setup_roles():
    """Create custom roles"""
    roles = [
        {
            "doctype": "Role",
            "role_name": "DyPOS Cashier",
            "description": "Cashier role for POS Next system",
        },
        {
            "doctype": "Role",
            "role_name": "Nexus POS Manager",
            "description": "Manager role for POS Next system",
        },
        {
            "doctype": "Role",
            "role_name": "DyPOS Manager",
            "description": "Manager role for Smart Ports POS",
        },
    ]

    for role in roles:
        if not frappe.db.exists("Role", role["role_name"]):
            doc = frappe.get_doc(role)
            doc.insert(ignore_permissions=True)


def setup_print_formats():
    """Setup print formats"""
    if not frappe.db.exists("Print Format", "POS Next Receipt"):
        return

    doc = frappe.get_doc("Print Format", "POS Next Receipt")
    if not doc.html or "المنافذ الذكية" not in str(doc.html):
        doc.html = get_receipt_html()
        doc.save()


def setup_workspace():
    """Setup workspace"""
    if not frappe.db.exists("Workspace", "DyPOS"):
        doc = frappe.get_doc(
            {
                "doctype": "Workspace",
                "name": "DyPOS",
                "label": "المنافذ الذكية POS",
                "module": "POS Next",
                "icon": "octicon octicon-screen-full",
                "type": "Module",
                "public": 1,
                "roles": ["POS User", "POS Manager", "System Manager"],
                "is_default": 1,
            }
        )
        doc.insert(ignore_permissions=True)


def setup_notifications():
    """Setup notifications"""
    pass


def setup_home_page():
    """Setup home page"""
    pass


def get_receipt_html():
    return """
<style>
    @page { size: 80mm auto; margin: 0mm; }
    body {
        font-family: 'Cairo', 'DejaVu Sans', 'Arial', sans-serif;
        width: 80mm; margin: 0 auto; padding: 10px;
        font-size: 11px; line-height: 1.4; direction: rtl;
    }
    .header { text-align: center; border-bottom: 2px solid #1E40AF; padding-bottom: 10px; }
    .company-name { font-size: 18px; font-weight: bold; color: #1E40AF; }
    .divider { border-top: 1px dashed #333; margin: 12px 0; }
    .total-row { font-size: 14px; font-weight: bold; border-top: 2px solid #1E40AF; padding-top: 8px; }
    .footer { border-top: 2px solid #1E40AF; margin-top: 15px; padding-top: 10px; text-align: center; font-size: 10px; }
</style>
<div class="header">
    <div class="company-name">المنافذ الذكية للبرمجيات</div>
</div>
{%- for item in doc.items %}
<div>{{ item.item_name }} - {{ item.qty }} × {{ item.rate }}</div>
{%- endfor %}
<div class="total-row">{{ doc.total }} {{ doc.currency }}</div>
<div class="footer">شكراً لتعاملكم مع المنافذ الذكية</div>
"""


def before_migrate():
    """Before migrate"""
    pass


def after_migrate():
    """After migrate"""
    frappe.reload_doc("DyPOS", "doctype", "pos_settings")
    frappe.clear_cache()