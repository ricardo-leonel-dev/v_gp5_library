---
feature_number: 17
name: stripe_subscription_billing
title: Stripe subscriptions for basic/premium plans
status: pending
created_at: 2026-10-03T21:05:53.000Z
updated_at: 2026-10-03T21:05:56.000Z
---

## Description
Stripe Checkout to buy basic/premium; a signed webhook updates the plan via setUserPlan (from plan_management_admin). Cancellation or payment failure downgrades to free; over-limit data stays readable (feature 14 D3).

## Acceptance
- [ ] 1) POST /billing/checkout {plan} returns a Stripe Checkout session URL. 2) POST /billing/webhook is public (outside auth), verifies the Stripe signature, and is idempotent on event id. 3) Handles checkout.session.completed and customer.subscription.updated/deleted. 4) Stores stripe_customer_id and subscription_id per user. 5) Stripe secrets come from per-stage config. 6) Tests use a mocked Stripe.
