# How Settlements Work

A plain-language guide for the business, finance and merchant-support teams.
No technical background needed.

---

## The one-sentence version

**Collections earn a merchant money and it builds up in their float. Settlement
is when you take that money out of their float and send it to their bank.**

Nothing else pays a merchant. Collections put money **in**; settlement is the
**only** way it goes out to a bank account.

---

## The three things to understand

| Term | What it means |
| --- | --- |
| **Float** | The merchant's running balance inside Instacompay — think of it as their wallet with us. |
| **Settlement** | A **claim**: "we owe this merchant K X." Creating one moves **no money**. |
| **Confirm** | You've actually made the bank transfer, so the wallet is now drawn down. |

> ### ⚠️ The one thing people get wrong
> **Creating a settlement is not paying anyone.** It's writing the invoice to
> ourselves. Money is only recorded as leaving when someone presses **Confirm**
> — and that should happen **only after the transfer has genuinely left our bank**.

---

## The money rules, in short

| What happens | Effect on the merchant's float |
| --- | --- |
| Customer pays the merchant (**collection succeeds**) | **+ Increases** by what they earn after fees |
| Collection fails | No change |
| Collection reversed / refunded to the customer | **− Decreases** (money goes back to the customer) |
| Merchant pays someone out (**disbursement**) | **− Decreases** immediately |
| Disbursement fails | **+ Increases** (refunded automatically) |
| **Settlement confirmed** | **− Decreases** — this is the payout to their bank |

**A merchant needs no float to collect.** Collecting is *how* they earn it — so a
brand-new merchant with an empty wallet can still take payments from day one.
Float is only needed to **pay money out**.

---

## End-to-end example: Grace's Shop

New merchant. Starts with **K0**. Fee is 2.5%, charged to the customer.

### Day 1 — a customer pays K100
The customer approves on their phone and the money reaches us.

> **Grace's float: K0 → K100**

She needed no float to receive this.

### Day 1, later — two more sales of K50 each

> **Grace's float: K100 → K200**

### Day 2 — Grace refunds a customer K30 (a payout)
Paying out spends float, and it's set aside straight away (K30 + fee).

> **Grace's float: K200 → K169.25**

### Day 3, 02:00 — the settlement run happens automatically
The system works out what she's owed:

```
earned      = K200 collected  −  K0 already settled   =  K200
still held  = K169.25 actually left in her float
settleable  = whichever is smaller                    =  K169.25
```

It creates a **Pending settlement of K169.25**.
**No money has moved yet** — her float is still K169.25.

> **Why the smaller of the two?** She earned K200 but already spent some paying
> her own customer. We can only send out what's actually still there.

### Day 3, morning — finance pays the bank
In **Admin → Settlements** they see:

> Grace's Shop · COL-000xxxx · **K169.25** · Pending

They make the **real bank transfer** to Grace's account, then click
**Confirm paid** and enter the bank reference.

> **Grace's float: K169.25 → K0** — the payout is recorded

Grace has been paid. Her wallet is empty because the money is now in her bank.

### If the bank transfer bounces
Click **Mark failed** and give a reason. The K169.25 becomes settleable again and
tomorrow's 02:00 run will propose it once more. **Nothing is lost.**

---

## The safety rail

Suppose we also gave Grace **K5,000 of float as working capital** so she could
make payouts before earning anything.

**Settlement will never send that K5,000 to her bank.** It only ever settles what
a merchant has genuinely **earned from collections**. Our working capital stays
ours.

---

## Who does what

| Step | Who | Where |
| --- | --- | --- |
| Settlements are proposed | Automatic, daily 02:00 | — |
| Propose one right now | Admin or Finance | Admin → Settlements → **Run settlement now** |
| Make the bank transfer | Finance | Your bank |
| Record it as paid | Admin or Finance | **Confirm paid** (+ bank reference) |
| Record a bounced transfer | Admin or Finance | **Mark failed** (+ reason) |

Only **Admin** and **Finance** roles can act on settlements.

---

## Quick answers

**Does creating a settlement send money?**
No. It only records what we owe. Money is recorded as leaving when you Confirm.

**Should I Confirm before or after paying the bank?**
**After.** Confirm means "the transfer has left." Confirming first would show a
merchant as paid when they haven't been.

**What if I Confirm the same settlement twice?**
You can't — the system rejects it. A settlement can only be paid once.

**Can a merchant with no float still take payments?**
Yes. Collecting is how they earn float. Float is only needed to pay money out.

**Why is a merchant's settleable amount less than what they collected?**
They've spent some of it — on payouts, refunds, or an earlier settlement. We can
only send what's still in their float.

**What happens to a failed settlement?**
It returns to settleable and gets proposed again on the next run.

---

## ⚠️ Current status — read before settling real money

The settlement engine and the admin screens are built and tested, and the daily
run is scheduled. **One item is still outstanding:**

Six historical collections were recorded under the **old** money rules, which
**charged merchants for receiving money** instead of paying them. Until those are
corrected, the affected merchants (Codesync and HighTouch) show **earned = 0** and
therefore **cannot settle their genuine earnings**.

**Do not confirm settlements for those merchants until that correction is agreed.**
New collections from now on follow the correct rules.
