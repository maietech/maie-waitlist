I. Data Collection Matrix (Demand Engine Inputs)
The waitlist is highly structured for market segmentation. It utilizes a progressive, 5-stage form to collect both qualitative and quantitative data. The data is ultimately written to a Cloudflare D1 SQLite database via a strictly typed serverless Pages function (/api/waitlist).  
Here is a breakdown of the exact data fields captured to fuel the demand engine:

| Form Stage | Data Point | Field Type / Options | Demand Assessment Utility |
|---|---|---|---|
| Stage 0 | Email Address | Required text input. | Core user identifier and notification routing. |
| Stage 1 | Name | Optional text input. | Personalization for future cohort communications. |
| Stage 1 | Company | Optional text input. | B2B lead generation and enterprise demand tracking. |
| Stage 2 | Role | Optional text input (e.g., CTO, Editor). | Persona mapping to determine primary user types. |
| Stage 2 | GitHub Username | Optional text input. | Developer ecosystem footprint and open-source engagement assessment. |
| Stage 3 | Acquisition Source | Select: GitHub, Twitter/X, Referral, Search, Other. | Crucial for the SEO specialist to attribute traffic and assess marketing channel efficacy. |
| Stage 4 | Feature Interests | Checkboxes: AI agents, Open source, Video tools, Marketplace. | Direct product-market fit indicator to shape priority feature development. |
| Hidden | Bot Honeypot | Hidden company_website input field. | Silently drops submissions if filled, maintaining high data integrity for the cohort. |

**Data Export Note:** The API includes a protected GET endpoint (`/api/waitlist?token=...`) that generates a clean CSV export containing all of these fields. Your SEO specialist can ingest this directly into spreadsheets or CRM platforms for immediate cohort analysis.  

II. The Cinematic UX Flow
The application treats the waitlist not as an endpoint, but as the opening act of a story. The journey strictly adheres to web accessibility compliance (a11y), utilizing `prefers-reduced-motion` queries throughout the CSS and JavaScript layers to ensure smooth degradation for users who require it.  

The user flow is divided into two distinct phases: **The Assembly (Pre-submission)** and **The Continuum (Post-submission)**.

1. The Assembly (Form Interaction)
* **Progressive Reveal:** The interface presents form fields sequentially (Stages 0-4) to reduce cognitive load. Completed stages dim to 42% opacity but remain visible on the screen.  
* **Client-Side Validation:** Progression is blocked if criteria are not met; for instance, providing an invalid email triggers a rapid CSS "shake" animation on the input field and sets the `aria-invalid` state to true.  
* **Submission & Redundancy:** Clicking "Reserve my spot" disables the button and posts the JSON payload to the API. If the database detects a `UNIQUE` constraint violation on the email, it handles it gracefully, returning a 200 OK status and informing the user they are already on the list.  

2. The Continuum (Post-Submission)
Once the form successfully submits, the user does not receive a standard confirmation popup. Instead, the DOM swaps the form out, and the user scrolls through a four-scene cinematic sequence.  

* **Scene 1: The Threshold:** The form dissolves and blurs out, replaced seamlessly in the center of the viewport by the headline "You're in." (or "You're already in.").  
* **Scene 2: The Invitation:** As the user scrolls, a highly modular `<canvas>` engine initializes the "Pixie" companion. Pixie visually evolves through temperaments—transitioning from curious, to focused, to celebrating—as the scroll depth increases, rendering procedural particle fields and orbital rings.  
* **Scene 3: The Journey:** The user scrolls through a series of bold, cross-fading intertitles (e.g., "What if software could direct itself?", "You're not waiting. You're arriving.") that drive home the product narrative.  
* **Scene 4: The Transition:** The page background becomes a dark curtain. A final "Welcome." appears, and if the user has not disabled animations, the application automatically redirects them to the main portal after a 1000ms dwell time.  

*(If a user has a system-level reduced motion preference enabled, the script respects this by stripping away the scroll-choreography, rendering settled scenes instantly, and leaving the final navigation to the main site as a manual link click rather than an automatic redirect).*
