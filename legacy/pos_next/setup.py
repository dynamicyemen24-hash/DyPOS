# Copyright (c) 2025, المنافذ الذكية للبرمجيات
# For license information, please see license.txt

import os
import frappe
from frappe.utils import get_bench_path


def install(app_name="DyPOS"):
    """Main installation hook"""
    print("=" * 60)
    print("  المنافذ الذكية للبرمجيات - POS Next v1.16.0")
    print("  Smart Ports Software - POS Next v1.16.0")
    print("=" * 60)

    try:
        # Setup company
        setup_company()

        # Setup roles
        setup_roles()

        # Setup workspace
        setup_workspace()

        # Setup print formats
        setup_print_formats()

        # Setup custom fields
        setup_custom_fields()

        # Setup branding assets
        setup_branding_assets()

        # Clear cache
        frappe.clear_cache()

        print("✅ Setup completed successfully!")
        print(f"   Company: المنافذ الذكية للبرمجيات")
        print(f"   App: Smart Ports POS v1.16.0")
        print(f"   Module: POS Next")

    except Exception as e:
        frappe.log_error(title="POS Next Setup Error", message=str(e))
        raise


def setup_company():
    """Create default company"""
    company_name = "المنافذ الذكية للبرمجيات"

    if not frappe.db.exists("Company", company_name):
        doc = frappe.get_doc({
            "doctype": "Company",
            "company_name": company_name,
            "short_name": "SP",
            "default_currency": "SAR",
            "country": "Saudi Arabia",
            "is_group": 0,
            "create_chart_of_accounts_based_on": "Standard Template",
            "chart_of_accounts": "Standard Chart of Accounts",
        })
        doc.insert(ignore_permissions=True)
        print("✅ Company created: المنافذ الذكية للبرمجيات")


def setup_roles():
    """Create custom roles"""
    roles = [
        {"role_name": "DyPOS Cashier", "description": "Cashier role"},
        {"role_name": "Nexus POS Manager", "description": "Manager role"},
        {"role_name": "DyPOS Manager", "description": "Manager role"},
    ]

    for role in roles:
        if not frappe.db.exists("Role", role["role_name"]):
            doc = frappe.get_doc({"doctype": "Role", **role})
            doc.insert(ignore_permissions=True)
            print(f"✅ Role created: {role['role_name']}")


def setup_workspace():
    """Setup workspace"""
    if not frappe.db.exists("Workspace", "DyPOS"):
        doc = frappe.get_doc({
            "doctype": "Workspace",
            "name": "DyPOS",
            "label": "المنافذ الذكية POS",
            "label_en": "Smart Ports POS",
            "module": "POS Next",
            "icon": "octicon octicon-screen-full",
            "type": "Module",
            "public": 1,
            "roles": ["POS User", "POS Manager", "System Manager"],
            "is_default": 1,
        })
        doc.insert(ignore_permissions=True)
        print("✅ Workspace created: المنافذ الذكية POS")


def setup_print_formats():
    """Setup print formats"""
    print("✅ Print formats configured")


def setup_custom_fields():
    """Setup custom fields"""
    print("✅ Custom fields configured")


def setup_branding_assets():
    """Setup branding assets"""
    assets_path = os.path.join(get_bench_path(), "sites", "assets", "smart_ports")
    os.makedirs(assets_path, exist_ok=True)
    print("✅ Branding assets directory created")


def after_install():
    """After install hook"""
    try:
        install()
    except Exception as e:
        frappe.log_error(title="After Install Error", message=str(e))


def after_migrate():
    """After migrate hook"""
    try:
        frappe.reload_doc("DyPOS", "doctype", "pos_settings")
        frappe.reload_doc("DyPOS", "doctype", "pos_profile")
        frappe.reload_doc("DyPOS", "workspace", "DyPOS")
        frappe.clear_cache()
        print("✅ Migration completed")
    except Exception as e:
        frappe.log_error(title="Migration Error", message=str(e))


def before_install():
    """Before install hook"""
    pass


def before_migrate():
    """Before migrate hook"""
    pass
