# Instacompay — Manual Test Plan (Business / QA)

A step-by-step checklist for testing the three live systems. **No technical
skills required** — just follow each step and mark the result. If anything
doesn't match the "Expected result", it's a bug: note it and grab a screenshot.

---

## 1. Before you start

### Systems under test
| System | Address |
| --- | --- |
| **Website** | https://instacompayzm.com |
| **Merchant Portal** | https://merchants.instacompayzm.com |
| **Admin Portal** | https://admin.instacompayzm.com |

### What you'll need
- A **laptop** and a **phone** (test on both — the site should work on each).
- Two browsers if possible (e.g. **Chrome** and **Safari/Edge**).
- **Login accounts** (ask the tech team to provide these before you start):
  - Merchant Portal: one **Admin**, one **Initiator**, one **Approver**, one **Viewer**.
  - Admin Portal: one **admin** login.
- An **email inbox** you can open for each test account (to receive one-time codes).
- **Two mobile numbers you personally control** — one **Airtel**, ideally one **MTN** — for payment tests.

### 🔴 Money warning — read this
The Merchant Portal **Collect** and **Disburse** features move **real money** on production accounts.
- Only test with a **designated test/sandbox account** (ask the tech team), **or**
- Use the **smallest amount (K1.00)** and **only numbers you own**.
- **Never** use a customer's number for a test.

### How to record a result
For each row, write **PASS**, **FAIL**, or **N/A**, and add a note if it failed.
When something fails, capture: **what you did**, **what you expected**, **what happened**, a **screenshot**, the **date/time**, and the **browser/device**.

---

## 2. Part A — Website (instacompayzm.com)

| # | Step | Expected result | Result |
| --- | --- | --- | --- |
| A1 | Open the website home page | Page loads within a few seconds; logo, hero image, and menu are visible; nothing looks broken | |
| A2 | Scroll the whole home page | All images load (no broken/missing images); the rotating/scrolling section changes on its own | |
| A3 | Click **How it works** in the menu | The correct page opens and reads clearly | |
| A4 | Click **Product** in the menu | The correct page opens | |
| A5 | Click **Contact** | The contact page/form opens | |
| A6 | On the Contact page, fill in name, email, message and submit | You get a clear confirmation that the message was sent (no error) | |
| A7 | Click every footer link | Each link opens the right page (none go to a "Not Found" / error page) | |
| A8 | Find the link to the **Merchant Portal / sign in** | It opens the Merchant Portal, **not** the Admin portal | |
| A9 | Open the home page on your **phone** | Layout adapts to the small screen; text is readable; no sideways scrolling | |
| A10 | Check the page for the old text **"BoZ Licence No. ____"** | This text should **not** appear anywhere | |

---

## 3. Part B — Merchant Portal (merchants.instacompayzm.com)

### B1. Sign in & security
| # | Step | Expected result | Result |
| --- | --- | --- | --- |
| B1.1 | Go to the Merchant Portal; sign in with a valid **email + password** | You're asked for a **one-time code** (OTP) | |
| B1.2 | Open your email; enter the 6-digit code | You reach the **Dashboard**; branding clearly says **Merchant Portal** | |
| B1.3 | Sign out, then sign in with a **wrong password** 5 times | After several tries the account is **temporarily locked** with a clear message | |
| B1.4 | Sign in correctly, then leave the page idle for ~10 minutes | Around 3 minutes before logout you see a **countdown warning**; after 10 minutes idle you're logged out and sent to the login page | |
| B1.5 | Use **Forgot password** and follow the email steps | You can reset the password and sign in with the new one | |

### B2. Everyday screens (sign in as **Admin**)
| # | Step | Expected result | Result |
| --- | --- | --- | --- |
| B2.1 | Open **Dashboard** | Your **company name** shows; totals/recent activity look sensible | |
| B2.2 | Open **Accounts** | Your account(s) appear with an **account number** (e.g. COL-000xxxx) and status | |
| B2.3 | Open **Transactions** | A list of transactions shows; try the filters (number, reference, status) | |
| B2.4 | Open **Settlements** | The settlements screen loads (may be empty — that's OK) | |
| B2.5 | Open **Reports**; create a report; download it as **CSV** and as **PDF** | Both files download and open; the PDF is branded | |

### B3. Collect a payment  🔴 *(test account or K1 only)*
| # | Step | Expected result | Result |
| --- | --- | --- | --- |
| B3.1 | Open **Collect**; choose an account and rail (**Airtel**), enter **K1.00** and **your own** number; submit | The payment starts (status **Processing**); if it's a live account, a prompt appears on the phone | |
| B3.2 | Approve the prompt on the phone (enter PIN) | The screen updates to **Success**; the amount and fee are shown | |
| B3.3 | Try to submit with an **empty amount** or bad number | The form blocks it with a clear message (no crash) | |

### B4. Payouts with two-person approval (maker-checker)
> Needs **two different people/logins**: an **Initiator** and an **Approver**.

| # | Step | Expected result | Result |
| --- | --- | --- | --- |
| B4.1 | Sign in as **Initiator**; open **Disburse**; request a **K1.00** payout to your own Airtel number | It's saved as **Pending approval** — money has **not** moved yet | |
| B4.2 | Still as the Initiator, open **Approvals** and try to approve your own request | You are **blocked** — a message says it needs a different admin | |
| B4.3 | Sign in as the **Approver**; open **Approvals** | The pending payout is listed | |
| B4.4 | As the Approver, **Approve** it | The payout is sent; status becomes **Processing → Success** (Airtel) | |
| B4.5 | As the Approver, **Reject** a different request (with a reason) | The request shows as **Rejected**; no money moves | |

### B5. User management & roles (sign in as **Admin**)
| # | Step | Expected result | Result |
| --- | --- | --- | --- |
| B5.1 | Open **User Management**; click **Add user**; fill name, email, a temporary password, and pick roles (e.g. **Initiator**) | The user is created and a temporary password is **emailed** to them | |
| B5.2 | Look at the roles shown next to each user | Role labels (Admin / Initiator / Approver / Viewer) are readable and **not overlapping/cut off** | |
| B5.3 | Add a second role to a user, then remove one | The change is reflected immediately | |
| B5.4 | **Disable** a user, then **Activate** them again | Status updates; a disabled user cannot sign in | |
| B5.5 | Sign in as a **Viewer** and open **Collect / Disburse** | The Viewer can view but **cannot** initiate a collection or payout (blocked) | |

### B6. API documentation page
| # | Step | Expected result | Result |
| --- | --- | --- | --- |
| B6.1 | Open **API Documentation** | Your API keys, a **Download Postman collection** button, and **Developer guides** links appear | |
| B6.2 | Click **Download Postman collection** | A file downloads | |
| B6.3 | Click the **Merchant Portal API** and **Public API** guide links | Each opens a clean, readable guide page | |

---

## 4. Part C — Admin Portal (admin.instacompayzm.com)

### C1. Sign in & security
| # | Step | Expected result | Result |
| --- | --- | --- | --- |
| C1.1 | Sign in with a valid admin **email + password**, then the emailed **one-time code** | You reach the admin **Dashboard**; branding clearly says **Admin** and looks **different** from the Merchant Portal | |
| C1.2 | Confirm there is **no** "Create a merchant account" sign-up on the admin login | Sign-up belongs on the **merchant** portal only, not admin | |
| C1.3 | Try a wrong password several times | The account locks temporarily with a clear message | |
| C1.4 | Leave idle ~10 minutes | Countdown warning, then automatic logout | |

### C2. Managing merchants
| # | Step | Expected result | Result |
| --- | --- | --- | --- |
| C2.1 | Open **Merchants**; open a merchant to view details | Merchant info, accounts, and documents are shown | |
| C2.2 | If there's a pending application, **Approve** (or **Reject** with a reason) | Status updates; the merchant receives an **email** notification | |
| C2.3 | Reset a merchant user's credentials (if available) | New credentials are issued/emailed; old ones stop working | |

### C3. Money & operations
| # | Step | Expected result | Result |
| --- | --- | --- | --- |
| C3.1 | Open **Float Management**; view an account's float/ledger | Balances and history are shown clearly | |
| C3.2 | Request a **float credit** for an account (small test amount) | It's saved as **pending approval** (a second admin must approve) | |
| C3.3 | Have a **different** admin approve the float credit | The balance increases by the credited amount; a record appears in the ledger | |
| C3.4 | Open **Transactions** and **Settlements** | Lists load and can be filtered | |

### C4. Configuration & admin users
| # | Step | Expected result | Result |
| --- | --- | --- | --- |
| C4.1 | Open **Settings** | Settings load and can be saved (a "saved" confirmation appears) | |
| C4.2 | Open **User Management**; create an admin/system user with a role | The user is created; roles are assignable | |
| C4.3 | Open **Reports**, **Security**, **Notifications** | Each screen loads without error | |

---

## 5. Part D — Cross-cutting checks

| # | Step | Expected result | Result |
| --- | --- | --- | --- |
| D1 | Compare the Merchant and Admin portals side by side | They look **clearly different** and are **clearly labelled** (no confusing which is which) | |
| D2 | Check every **email** you received during testing (OTP, welcome, invite, approval/rejection) | Emails are branded, readable, and arrive within a couple of minutes | |
| D3 | Repeat a few key screens in a **second browser** | Behaves the same | |
| D4 | Repeat login + dashboard on a **phone** | Usable on a small screen | |
| D5 | Anywhere you're logged out unexpectedly | You're returned to the **login page**, not an error page | |

---

## 6. Results summary

| Section | Total | Passed | Failed | Tester | Date |
| --- | --- | --- | --- | --- | --- |
| A — Website | 10 | | | | |
| B — Merchant Portal | 22 | | | | |
| C — Admin Portal | 12 | | | | |
| D — Cross-cutting | 5 | | | | |

---

## 7. Bug report template (copy for each issue)

```
Title:        <short summary>
System:       Website / Merchant Portal / Admin Portal
Test case #:  <e.g. B4.2>
Severity:     Blocker / High / Medium / Low
Steps:        1) … 2) … 3) …
Expected:     <what should have happened>
Actual:       <what happened>
Browser/Device: <e.g. Chrome on Windows / Safari on iPhone>
Date/Time:    <when>
Screenshot:   <attach>
```
