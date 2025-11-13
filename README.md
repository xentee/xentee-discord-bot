> ⚠️ **Proprietary Code — No Redistribution**
>
> The contents of this repository are protected by copyright and are proprietary to **XenTee**.
> Viewing is allowed, but **any reuse, modification, or distribution** without **written permission** is **prohibited**.

# XenTee Cashtrade Assistant

A private and fully automated Discord system designed to streamline **cash trading** for CS2 items between users and XenTee.  
This bot runs exclusively on XenTee’s server and is **not** intended for public distribution.

The assistant handles every step of the selling process through an intuitive, interactive flow inside **private ticket channels**.  
Users are guided through structured prompts (buttons, modals, select menus) so they can clearly and consistently submit the items they want to sell.

---

## 🎫 Ticket System

Users start by clicking a button to **open a private ticket**. The bot automatically:

- Creates a **private text channel**
- Grants access only to **the user**, **XenTee**, and **the staff role**
- Initializes per-ticket state (**language**, **payment method**, **items added**, …)

This ensures every trade is handled **cleanly and privately**.

---

## 🌍 Language Selection

The first step is choosing a language:

- 🇺🇸 **English**
- 🇫🇷 **Français**

All subsequent questions and labels adapt dynamically.

---

## 💳 Payment Method

The bot asks the user to specify a payment method via a modal, such as:

- Revolut  
- PayPal Friends & Family  
- Crypto  
- Other

This choice is stored for the rest of the ticket.

---

## 💸 Sell or Buy

The user chooses:

- **Sell to XenTee**
- **Buy from XenTee** *(currently a placeholder — users are told to simply write what they want)*

The structured workflow currently applies to the **Sell** path.

---

## 🔍 Advanced Item Search System

A custom search pipeline provides accurate, clean results.

### Supported CS2 item categories
- **Weapon skins**
- **Knives**
- **Gloves**
- **Agents**
- **Cases** *(with quantity prompt)*

### Intelligent search
- Query-based ranking & token scoring  
- Weapon name detection  
- Case-specific logic  
- Removal of Pricempire “index tiles”  
- Sanitization of malformed labels (e.g., `ContainerOperation…`, price suffixes)

### Automatic name formatting
- Inserts proper ` | ` separators  
- Normalizes odd Pricempire formats  
- Fixes casing for weapon prefixes (**AWP**, **AK-47**, **M4A1-S**, **MP9**, etc.)  
- Strips unwanted prefixes/suffixes (**StatTrak™**, **Souvenir**, **price ranges**)

### Clean results
Users receive a **clean, sorted list** and select the correct item from a **dropdown menu**.

---

## 🧠 Type-Based Flow

The bot adapts to the detected item type:

1. **Agents**  
   - No wear, no StatTrak → **added instantly**.

2. **Cases**  
   - No wear, no StatTrak → **asks for quantity**, then adds.

3. **Gloves**  
   - No StatTrak in CS2 → **skips StatTrak**, user selects **wear (FN → BS)**.

4. **Weapon Skins**  
   - Asks **StatTrak?** → then **Select wear** → adds with proper formatting.

---

## 🧾 Final Summary (Preview)

After the user finishes adding items, the bot:

- Prompts for **optional details** (float, pattern, notes).
- Generates a clean summary, for example:
  - Skins: `• StatTrak™ AK-47 | Vulcan (FT)`
  - Gloves: `• Specialist Gloves | Crimson Kimono (MW)`
  - Agents: `• Sir Bloody Miami Darryl`
  - Cases: `• Revolution Case x20`
- Includes an **“Additional info”** section when provided.
- Shows a button to **start price computation** *(placeholder)*.

---

## 🧩 Architecture Notes

- Per-ticket state is **isolated by channel ID**.  
- Multiple users can open tickets **simultaneously**.  
- **No shared state** between tickets.  
- Search flow uses a **custom ranker** + **Pricempire** data.  
- Full support for:
  - Wear mapping  
  - StatTrak logic  
  - Knife naming consistency  
  - Case-type behavior

---

## 🚀 Purpose of the Project

Built **specifically for XenTee** to:

- Standardize how users submit items  
- Avoid misunderstandings during trades  
- Make valuation faster and cleaner  
- Eliminate manual typing errors  
- Provide a smooth, intuitive experience

> This project is **private** and **not** intended for reuse or publication beyond this environment.

---

## 📌 Internal Roadmap

- Integrate **Buff** price fetching  
- Add **automatic liquidity checks**  
- Staff **ticket-closing** commands  
- Persist **ticket logs** in a database  
- Margin/offer **calculation logic**

© 2025 XenTee — All rights reserved.
