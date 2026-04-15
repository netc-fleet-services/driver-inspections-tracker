# Pre-Trip Compliance Audit App

## Purpose

Upload two Excel files:

1. Driver Activity Report
2. PreTrip Inspections Report

Automatically calculate:

- Required inspections per driver
- Completed inspections
- Missed inspections
- Completion %
- Missing inspection details

---

# Tech Stack

## Frontend
- Next.js
- React
- Tailwind CSS
- shadcn/ui components

## Backend
- Python FastAPI

## Database
- PostgreSQL (Supabase) - no need for now, will potentially implement in future versions

## File Processing
- Pandas
- OpenPyXL

## Hosting
- Github pages 

---

# Core User Flow

## Step 1: Login

Roles:

- Admin
- Dispatcher
- Manager
- Read Only

---

## Step 2: Upload Files

Inputs:

- DriverActivity.xlsx
- PreTripInspections.xlsx

Button:

- Run Audit

---

## Step 3: Processing Engine

### Read Driver Activity File

Extract:

- Driver Name
- Driver2-Driver5
- Enroute Time
- Truck

### Generate Requirements

Create unique rows:

Driver + Date + Truck

Each row = 1 required inspection

---

### Read PreTrip File

Extract:

- Date
- Truck
- Employee

Normalize to calendar date only.

Deduplicate:

Employee + Date + Truck

---

### Matching Logic

## Exact Match First

Driver = Employee  
Date = Date  
Truck = Truck

## Fuzzy Match Second

If no exact match:

- Similar names
- Same truck
- Same date

Examples:

Chris Beckwith = Christopher Beckwith

---

## Calculate Metrics

For each driver:

- Required
- Completed
- Missed
- Completion %

---

# Dashboard Pages

## Executive Dashboard

Cards:

- Fleet Completion %
- Total Missed
- Drivers Below 80%
- Drivers at 100%

Charts:

- Daily compliance trend
- Worst offenders
- Most missed trucks

---

## Driver Leaderboard

Sortable table:

| Driver | Required | Completed | Missed | % |

Filters:

- Date range
- Company
- Truck type

---

## Missing Inspections Page

| Driver | Date | Truck |

---

## Fuzzy Match Review Page

| Dispatch Name | Inspection Name | Score |

Allow manager approval.

---

# Automation

## Scheduled Weekly Import

Connect email inbox or folder.

Every Monday:

- Import new files
- Run audit
- Email report

---

# Alerts

If today's driver has no inspection by 10 AM:

- Email
- SMS
- Dispatcher alert

---

# Database Tables

## uploads

- id
- filename
- uploaded_at
- user_id

## driver_activity

- id
- driver_name
- date
- truck
- source_upload_id

## inspections

- id
- employee
- date
- truck
- source_upload_id

## audit_results

- id
- driver
- required
- completed
- missed
- percent
- week_ending

---

# Future Enhancements

- OCR from paper forms
- Mobile driver check-in app
- QR code on trucks
- Signature capture
- GPS verification
- Multi-location dashboards

