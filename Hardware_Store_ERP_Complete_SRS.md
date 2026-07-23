# Hardware Store ERP - Complete Software Requirements Specification (SRS)

## SRS-01: Executive Summary & System Architecture

Project: Hardware Store ERP for Furniture Manufacturing
Version: 1.0
Status: Draft

### 1. Vision

This ERP will replace spreadsheet-based hardware tracking with a centralized, scalable inventory platform designed specifically for furniture manufacturing. The system will manage procurement, storage, consumption, reporting, and administration while maintaining a complete audit trail.

### 2. Objectives

Manage 1,500+ hardware SKUs with intelligent search.

Eliminate duplicate product creation.

Provide instant GRN and MIS processing.

Support dynamic product attributes by category.

Offer role-based dashboards and permissions.

Remain scalable for future procurement and barcode modules.

### 3. Scope

Dashboard

Hardware Inventory (GRN, MIS, Store Log)

Hardware Master

Supplier, Staff, Unit, Category, Attribute and Bin Masters

Reports

Import / Export

Authentication & User Management

Audit Logging

### 4. User Roles

### Admin

Manage all masters

Manage users and permissions

Edit or soft-delete transactions with mandatory reason

View analytics and audit logs

### Store Manager

Create GRNs

Create MIS

Search inventory

View dashboards

Cannot edit posted transactions

### 5. Technology Architecture

Frontend: Next.js App Router + React + TypeScript

Tailwind CSS + shadcn/ui

TanStack Table

React Hook Form + Zod

Backend: Next.js Route Handlers

Prisma ORM

PostgreSQL

Better Auth

Docker-ready deployment

Progressive Web App

### 6. High-Level Architecture


Presentation Layer
    ↓
Application Layer
    ↓
Business Logic Layer
    ↓
Prisma ORM
    ↓
PostgreSQL Database

### 7. Non-Functional Requirements

Responsive on desktop, tablet and mobile.

PWA installation support.

Fuzzy search using PostgreSQL Full Text Search + pg_trgm.

Secure role-based authorization.

Audit trail for critical actions.

Modular architecture for future expansion.

### 8. Coding Standards

Strict TypeScript

Feature-based folder structure

Reusable UI components

Server-side validation

Transactions for inventory updates

Soft delete where appropriate

### 9. Roadmap

SRS-02 Database Design

SRS-03 Authentication & Permissions

SRS-04 Masters

SRS-05 Inventory Engine

SRS-06 Reports & Dashboards

SRS-07 Search & Import/Export

SRS-08 UI/UX

SRS-09 Backend APIs

SRS-10 Deployment & Testing

---

## SRS-02: Database Design & Data Model

Version 1.0
This document defines the logical database design for the Hardware Store ERP.

### 1. Design Principles

UUID primary keys for all tables.

Soft delete for transactional and master data where applicable.

created_at, updated_at on all tables.

Audit logging for privileged actions.

Indexed searchable columns.

Foreign key constraints enforced.

### 2. Core Entities

### users

Purpose: Application users

### roles

Purpose: Role definitions

### permissions

Purpose: Permission catalog

### role_permissions

Purpose: Role mapping

### hardware_products

Purpose: Hardware master

### product_aliases

Purpose: Alternative names

### categories

Purpose: Product categories

### attributes

Purpose: Dynamic attributes

### product_attribute_values

Purpose: Dynamic values

### suppliers

Purpose: Supplier master

### staff

Purpose: Staff master

### bins

Purpose: Storage bins

### grn_headers

Purpose: Goods receipt header

### grn_items

Purpose: GRN lines

### mis_headers

Purpose: Material issue header

### mis_items

Purpose: Material issue lines

### audit_logs

Purpose: Audit trail

### 3. Relationships

Role → Users (1:N)

Role → Permissions (M:N)

Category → Products (1:N)

Product → Aliases (1:N)

Product → Attribute Values (1:N)

Supplier → GRN (1:N)

GRN → GRN Items (1:N)

MIS → MIS Items (1:N)

Product → GRN Items (1:N)

Product → MIS Items (1:N)

User → Audit Logs (1:N)

### 4. Index Strategy

Unique index on SKU

GIN full-text index on searchable text

pg_trgm indexes for fuzzy search

Indexes on foreign keys

Composite indexes for reports (date + supplier, date + product)

### 5. Inventory Rules

GRN increases current_stock. MIS decreases current_stock. Negative stock is permitted with warning. Stock is maintained only in base units. Rates are stored for purchasing history and reporting, not inventory valuation.

---

## SRS-03: Authentication, Authorization & Security

Version 1.0

### 1. Authentication

Better Auth for authentication.

Email/password login for V1.

Session-based authentication using secure HTTP-only cookies.

Password hashing handled by authentication library.

Logout invalidates active session.

### 2. User Lifecycle

Admin creates users.

Users are assigned a role on creation.

Users can be activated/deactivated.

Deactivated users cannot sign in.

### 3. Roles

### Admin

Full system access.

Manage users, roles and permissions.

Edit/delete posted transactions with mandatory reason.

Access audit logs and reports.

### Store Manager

Create GRNs and MIS.

View permitted masters.

Cannot edit/delete posted transactions.

View operational dashboard.

### 4. Permission Matrix

### 5. Authorization Rules

Every API validates session.

Every API validates permission before execution.

Unauthorized requests return HTTP 403.

Unauthenticated requests return HTTP 401.

### 6. Audit Logging

Log login/logout.

Log create/update/delete actions.

Mandatory reason for edits/deletes of transactions.

Record user, timestamp, entity, action and reason.

### 7. Password & Session Security

Strong password policy configurable.

Secure cookies.

CSRF protection.

Automatic session expiry after inactivity.

Remember-me optional for future release.

### 8. Validation

Unique email addresses.

Role required for every user.

Inactive users cannot authenticate.

Permission checks enforced server-side.

### 9. Future Enhancements

Two-factor authentication.

Single Sign-On.

Password reset by email.

IP/device history.

Login alerts.

---

## SRS-04: Masters Module Specification

Version 1.0

### 1. Overview

The Masters module contains all reference data used throughout the ERP. Only authorized users may create or modify master records.

### 2. Hardware Master

Auto-generated SKU format: HW-<CATEGORY>-<AUTO NUMBER>.

Manual SKU regeneration by Admin with SKU history retained.

One product image per hardware item.

Fields: Description, Category, Subcategory, Unit, Finish, Size, Minimum Stock, Opening Stock, Default Bin, Status.

Dynamic attributes based on category.

Product aliases stored and searchable.

Active/Inactive lifecycle.

Delete only when no transaction history exists.

### Hardware Master Validation

Description is mandatory.

Category is mandatory.

Base unit is mandatory.

Duplicate detection compares category + description + required attributes + unit.

Current stock cannot be manually edited except through approved opening stock/adjustment.

### 3. Category Master

Create/Edit/Deactivate categories.

Map dynamic attributes to categories.

Display active product count.

Prevent deletion when products exist.

### 4. Dynamic Attribute Master

Supported types: Text, Number, Dropdown, Yes/No.

Attributes may be Required and/or Searchable.

Category-specific attribute mapping.

Attribute values indexed for search.

### 5. Unit Master

Base unit per product.

Additional purchase units with conversion factors.

Inventory always maintained in base unit.

Prevent deletion when referenced.

### 6. Supplier Master

Fields: Name, Contact Person, Phone, Email, GST (optional), Address, Status.

Autocomplete during GRN.

Active/Inactive lifecycle.

Supplier activity report.

### 7. Staff Master

Fields: Name, Department, Employee Code (optional), Phone, Status.

Autocomplete during MIS.

Consumption reports by staff and department.

### 8. Bin Master

Optional storage bins.

Default bin suggestion.

Multiple bins per product supported.

Bin-wise inventory reporting.

### 9. Intelligent Search

Fuzzy search using PostgreSQL Full Text Search and pg_trgm.

Search across SKU, previous SKU, aliases, description, category, attributes, finish, size, unit and bin.

Typo tolerant and partial-word matching.

Results show image, SKU, stock, unit and status.

### 10. Acceptance Criteria

New products receive unique SKU.

Duplicate products are blocked with existing product suggestion.

Inactive records remain visible in history but unavailable for new transactions by default.

Master data changes are audited.

Search returns relevant results within target performance limits.

---

## SRS-05: Inventory Engine (GRN, MIS & Store Log)

Version 1.0

### 1. Overview

The Inventory Engine controls all stock movements. Inventory is maintained only in base units. Every movement is traceable through immutable transaction records and audit logs.

### 2. Inventory Principles

Quantity-based inventory only.

Purchase rates are stored for reporting, not valuation.

Inventory updates immediately when a transaction is saved.

Negative stock is allowed with a warning.

All movements are recorded in the Store Log.

### 3. Goods Receipt Note (GRN)

Auto-generated GRN number.

Editable date/time.

Supplier autocomplete with quick add.

Optional invoice number and invoice date.

Unlimited line items.

Smart product search with image preview.

Quick Add product if not found.

Supports purchase units with automatic conversion to base units.

Optional bin selection.

Updates stock immediately.

### GRN Validation

Supplier required.

Product required.

Quantity must be greater than zero.

Rate must be zero or greater.

Duplicate products in the same GRN should be merged or warned.

### GRN Save Workflow

Validate header and line items.

Convert purchase quantity to base unit.

Increase current stock.

Update last purchase rate/date/supplier.

Update highest and lowest purchase rate.

Create purchase history entry.

Create audit log.

Create Store Log entry.

### 4. Material Issue Slip (MIS)

Auto-generated MIS number.

Recipient type: Manufacturing, Polishing, Packaging or Other.

Staff autocomplete.

Purpose mandatory when recipient type is Other.

Unlimited line items.

Optional bin selection/split.

Immediate stock deduction.

### MIS Validation

Product required.

Quantity greater than zero.

Warn if projected stock becomes negative.

User may continue after confirmation if permitted.

### MIS Save Workflow

Validate header and lines.

Deduct stock in base units.

Update bin quantities if applicable.

Create Store Log entry.

Create audit log.

### 5. Store Log

Single chronological ledger for all GRNs and MIS.

Filter by date, product, supplier, staff, user and transaction type.

Export to Excel.

Read-only for Store Manager.

Admin edits require mandatory reason.

### 6. Purchase History

Automatically generated from GRNs.

Displays supplier, date, rate, quantity and invoice reference.

Supports filtering and export.

### 7. Product Summary Calculations

Current Stock

Minimum Stock

Last Purchase Rate

Lowest Purchase Rate

Highest Purchase Rate

Last Supplier

Last Purchase Date

Last Purchase Quantity

### 8. Negative Stock Rules

Warning displayed before saving.

Projected stock shown.

Inventory allowed to become negative.

Negative stock highlighted on dashboards and reports.

### 9. Multi-Bin Logic

Products may have zero, one or many bins.

Default bin suggested automatically.

GRN may assign stock to any bin.

MIS may issue from one or more bins.

Bin-level balances maintained.

### 10. Acceptance Criteria

GRN immediately increases stock.

MIS immediately decreases stock.

Stock maintained in base units.

Every transaction appears in Store Log.

Audit records generated for privileged actions.

Inventory calculations remain accurate after edits and soft deletes.

---

## SRS-06: Reports & Dashboards

Version 1.0

### 1. Overview

This module provides operational and analytical reporting with role-specific dashboards. All reports support filtering, sorting and Excel export.

### 2. Store Manager Dashboard

Today's GRNs

Today's MIS

Items Received Today

Items Issued Today

Low Stock Products

Negative Stock Products

Recent Transactions

Quick Actions: New GRN, New MIS, Search Product, Store Log

### 3. Admin Dashboard

Total Products

Active Suppliers

Active Staff

Products Below Minimum Stock

Negative Stock Count

Today's Purchases

Today's Consumption

Top 10 Purchased Products

Top 10 Consumed Products

Monthly Purchase Trend

Monthly Consumption Trend

Recent Audit Activity

User Activity Feed

System Alerts

### 4. Reports

Inventory Summary

Low Stock Report

Negative Stock Report

Purchase Report

Consumption Report

Product Activity Report

Supplier Activity Report

Staff Consumption Report

Bin-wise Inventory Report

Audit Log Report

Store Log Report

### 5. Report Filters

Date range

Supplier

Staff

Product

Category

Bin

Status

Transaction Type

User

Recipient Type

### 6. Charts

Monthly purchase trend

Monthly consumption trend

Top products by consumption

Top products by purchase quantity

Supplier contribution

Department-wise consumption

### 7. Export Requirements

Export filtered data to Excel.

Preserve applied filters in exported report.

Column selection for exports (future enhancement).

### 8. Dashboard Refresh

KPIs update immediately after GRN/MIS save.

Charts refresh automatically.

Low stock and negative stock widgets update in real time where possible.

### 9. Performance Requirements

Dashboard load target under 2 seconds on indexed database.

Large reports should use server-side pagination.

Exports generated asynchronously if dataset is large.

### 10. Acceptance Criteria

Dashboards display role-appropriate information only.

All reports support filtering and export.

KPIs match inventory transactions.

Alerts accurately identify low and negative stock.

---

## SRS-07: Search Engine, Import & Export

Version 1.0

### 1. Intelligent Search Engine

Powered by PostgreSQL Full Text Search and pg_trgm.

Supports typo tolerance, partial words and unordered terms.

Indexes SKU, previous SKU, aliases, description, category, attributes, finish, size, unit and bin.

Results ranked by relevance.

Displays image, SKU, description, stock, unit and status.

### 2. Duplicate Detection

Runs before product creation.

Compares category, description, required dynamic attributes and unit.

Displays potential duplicates with SKU, image and stock.

Allows opening existing product instead of creating duplicate.

### 3. Alias Engine

Aliases can be added manually.

When a user searches using a different name and selects an existing product, the alias can be suggested for saving.

Aliases participate in search ranking.

### 4. Quick Add Workflow

Available during GRN.

Requires minimum fields only.

Allows completion of remaining attributes later.

Creates audit record.

### 5. Excel Import

Supported: Products, Suppliers, Staff, Categories, Units, Attributes, Bins, Opening Stock, Aliases.

Downloadable templates.

Preview before commit.

Validation performed before import.

No partial commit if validation fails.

### 6. Import Validation

Mandatory field validation.

Duplicate SKU detection.

Duplicate product detection.

Unknown category/unit/bin detection.

Conversion factor validation.

Human-readable error report with row numbers.

### 7. Excel Export

Export Hardware Master.

Export GRNs and MIS.

Export Store Log.

Export all reports.

Exports respect applied filters.

### 8. Performance

Search response target under 500 ms on indexed database.

Large imports processed in batches.

Exports stream large datasets to reduce memory usage.

### 9. Security

Import/export permissions controlled by role.

Imports logged in audit trail.

Only supported file formats accepted.

### 10. Acceptance Criteria

Users can find products using SKU, aliases or partial descriptions.

Duplicate creation is prevented.

Imports provide clear validation feedback.

Exports accurately reflect filtered data.

---

## SRS-08: UI/UX Specification

Version 1.0

### 1. Design Principles

Clean industrial UI with minimal distractions.

Responsive desktop-first with tablet and mobile support.

Consistent spacing, typography and iconography.

Accessible keyboard navigation and focus states.

### 2. Global Layout

Collapsible left sidebar navigation.

Top app bar with search, notifications, user menu.

Breadcrumb navigation.

Persistent page title and action buttons.

### 3. Dashboard Screens

Separate dashboards for Admin and Store Manager.

Responsive KPI cards.

Charts adapt to screen width.

Recent activity and alerts panels.

### 4. Hardware Master

Filter panel with saved filters.

Paginated searchable table.

Image thumbnail column.

Quick view drawer.

Create/Edit dialog with dynamic attributes.

### 5. GRN Screen

Header section with supplier and invoice details.

Spreadsheet-style editable line items.

Intelligent product search.

Image preview.

Running totals.

Keyboard-first data entry.

### 6. MIS Screen

Recipient selector.

Staff autocomplete.

Purpose field for 'Other'.

Negative stock warning dialog.

Optional multi-bin selector.

### 7. Reports

Reusable filter toolbar.

Sortable tables.

Export button.

Charts above detail tables.

Print-friendly layout.

### 8. Forms & Validation

Inline validation.

Required field indicators.

Toast notifications.

Confirmation dialogs for destructive actions.

Auto-save draft support (future-ready).

### 9. Responsive Behaviour

Desktop: full tables and sidebars.

Tablet: collapsible filters.

Mobile: stacked cards, drawers, horizontal scrolling only when necessary.

PWA install prompt.

### 10. Accessibility

WCAG-conscious color contrast.

Keyboard shortcuts.

ARIA labels for controls.

Logical tab order.

### 11. Component Library

shadcn/ui components.

TanStack Table.

Recharts.

React Hook Form.

Lucide icons.

### 12. Acceptance Criteria

Responsive across supported devices.

Fast navigation.

Consistent UI patterns.

Accessible forms.

Minimal clicks for common inventory workflows.

---

## SRS-09: Backend APIs & Business Logic

Version 1.0

### 1. Backend Architecture

Next.js App Router with Route Handlers.

Prisma ORM for data access.

PostgreSQL database.

Feature-based service architecture.

All write operations executed inside database transactions.

### 2. API Design Standards

RESTful endpoints.

JSON request/response.

Versioned under /api/v1.

Consistent pagination, filtering and sorting.

Standard HTTP status codes.

### 3. Authentication Middleware

Validate Better Auth session.

Resolve authenticated user.

Verify required permission before executing business logic.

Return 401 for unauthenticated requests and 403 for unauthorized requests.

### 4. Core API Modules

### 5. Business Logic

GRN increases stock after successful validation.

MIS decreases stock after successful validation.

All inventory maintained in base units.

Purchase unit conversion performed before stock update.

Negative stock warning shown but transaction may proceed if permitted.

Purchase summary fields automatically recalculated.

### 6. Validation Rules

Server-side validation for every request.

Duplicate detection before product creation.

Mandatory field validation.

Referential integrity checks.

Soft-delete restrictions enforced.

### 7. Error Handling

Structured JSON error format.

Validation errors include field-level details.

Unexpected errors logged.

Database transaction rollback on failure.

### 8. Concurrency & Performance

Transactional stock updates.

Prevent race conditions during simultaneous inventory updates.

Database indexes on searchable fields.

Server-side pagination for large datasets.

### 9. Audit Integration

Create audit entries for create, update, delete and privileged actions.

Store user, entity, timestamp and reason where applicable.

### 10. Acceptance Criteria

APIs enforce authentication and authorization.

Inventory remains consistent under concurrent use.

Failed transactions leave no partial updates.

Responses are consistent across modules.

---

## SRS-10: Development, Testing & Deployment

Version 1.0

### 1. Project Structure

app/
components/
features/
lib/
hooks/
services/
prisma/
types/
public/
tests/
docker/

### 2. Coding Standards

Strict TypeScript.

ESLint and Prettier.

Feature-based architecture.

Reusable components.

Server-side validation for all mutations.

Meaningful commit messages.

### 3. Git Workflow

main for production.

develop for integration.

Feature branches for new work.

Pull requests required before merge.

Code review mandatory.

### 4. Environment Configuration

Separate development, staging and production environments.

Environment variables for secrets.

Never commit credentials.

### 5. Docker & Deployment

Docker Compose for local development.

Separate PostgreSQL container.

Production-ready Dockerfile.

Health checks enabled.

### 6. Database Operations

Prisma migrations.

Seed scripts.

Nightly backups.

Backup verification.

Restore procedures documented.

### 7. Testing Strategy

Unit tests for business logic.

Integration tests for APIs.

End-to-end tests for key workflows (GRN, MIS, Search).

Regression testing before releases.

### 8. Logging & Monitoring

Application logs.

Audit logs.

Error logging.

Performance metrics.

Database monitoring.

### 9. Security Hardening

HTTPS in production.

Secure cookies.

Rate limiting.

Input sanitization.

Dependency vulnerability scanning.

Regular security updates.

### 10. Performance

Lazy loading.

Code splitting.

Database indexing.

Server-side pagination.

Caching where appropriate.

### 11. Release Checklist

Run migrations.

Execute automated tests.

Create backup.

Deploy application.

Smoke test production.

Monitor logs after release.

### 12. Maintenance

Periodic dependency updates.

Backup testing.

Performance reviews.

Database cleanup.

User feedback review.

### 13. Future Roadmap

Barcode/QR scanning.

Purchase Orders.

Supplier portal.

Mobile warehouse app.

Offline synchronization.

RFID support.

Business intelligence dashboards.

NestJS microservice migration.

### 14. Acceptance Criteria

Application deploys consistently using Docker.

Automated tests pass before release.

Backups can be restored successfully.

Production monitoring is operational.

Security best practices are enforced.

---

