# BitSecure — Data Communications Lab

BitSecure is an interactive, browser-based Data Communications and Computer Networks learning platform. It combines guided lessons with hands-on protocol labs and visual simulations. Learners can follow data from an application message through packetization and transmission, inspect networking concepts layer by layer, and experiment with errors, security, routing, and network behaviour.

> **Learning environment:** Most networking activities are educational simulations that run in the browser. They do not configure the learner's operating system, change a real firewall/router, or send simulated packets across the public internet.

## Highlights

### End-to-end data transmission
- Explore the complete sender-to-receiver journey: input, encoding, packetization, link transmission, and reconstruction.
- Work with **text, images, videos, documents, and audio files** in the core transmission lab.
- Inspect bytes, packet headers, payloads, checksums, delivery order, acknowledgements, retries, and reassembly.
- Experiment with packet loss, bit corruption, delivery order, retry limits, and transmission speed.

### Link layer and reliable delivery
- Study framing and byte/bit stuffing.
- Compare parity, Internet checksum, CRC-8, and CRC-32 error-detection techniques.
- Experiment with error correction using **SECDED Hamming code, two-dimensional parity, and Reed–Solomon coding**.
- Simulate Stop-and-Wait and Sliding Window ARQ, including acknowledgements, timeouts, and retransmissions.

### Network layer
- Practise IPv4 addressing and subnet calculations.
- Inspect IP headers and routing decisions.
- Build and explore network topologies.
- Experiment with a Wi-Fi simulator covering access points, clients, SSID, band, channel, signal coverage, simplified interference, and obstacles.

### Transport layer
- Compare TCP and UDP and inspect transport headers and ports.
- Step through the TCP handshake.
- Explore congestion control, congestion-window behaviour, duplicate ACKs, and timeout scenarios.
- Learn about sockets and multiplexing.
- Use the Network Performance Analyzer to estimate transfer time, throughput, delivery ratio, and retransmissions from configurable bandwidth, RTT, packet loss, packet size, packet count, and retry settings.

### Application layer and security
- Visualize DNS resolution and caching.
- Explore HTTP requests, responses, methods, and status codes.
- Step through TLS handshake and related security concepts.
- Use the encryption and decryption lab to inspect processing stages for Caesar and XOR teaching ciphers, AES-256-GCM, RSA-OAEP with AES-GCM hybrid encryption, ECDH P-256 key agreement with AES-GCM, and SHA-256 hashing.
- Inspect intermediate outputs and receiver-side results in supported demonstrations.

**Cryptography note:** Caesar and XOR are intentionally insecure teaching examples. SHA-256 is a one-way hash, not encryption. The browser-based demonstrations are for learning and should not replace vetted protocols and libraries in production applications.

### Advanced and learning features
- Study encapsulation and decapsulation across networking layers.
- Inspect packet captures and practise display filtering.
- Work through guided troubleshooting exercises.
- Create ordered packet-filtering rules in the Firewall and Access Control Lab, test sample traffic, and see first-match decisions and rule-order effects.
- Use the searchable Network Protocol Comparison Lab, including an interactive OSI and TCP/IP layer mapping.
- Explore the guided learning journey, tutorials, challenges, quizzes, glossary, achievements, and progress indicators.

### Accounts and progress
- Firebase Authentication supports email/password sign-up and sign-in, email verification, password reset, password change, and sign-out.
- Firestore synchronizes account-specific learning progress, achievements, run history, quiz statistics, notes, theme, and last visited screen.
- A local account-specific cache helps preserve progress when cloud access is temporarily unavailable.
- Responsive navigation includes a collapsible desktop sidebar and a mobile navigation drawer.

## Technology

- HTML, CSS, and vanilla JavaScript using native ES modules.
- Firebase Authentication and Cloud Firestore for account and progress features.
- Browser Web Crypto API for supported cryptography demonstrations.
- Browser storage for local preferences and cached learning progress.

## Requirements

- A modern browser with JavaScript ES module support.
- The Web Crypto API for the supported cryptography demonstrations.
- Python 3 or another local static HTTP server.
- A Firebase project with Authentication and Cloud Firestore configured for account-based features.

## Run locally

1. Clone the repository and open a terminal in the project root.
2. Start a local static server:

   ```bash
   python3 -m http.server 8000
   ```

3. Open [http://localhost:8000](http://localhost:8000).

You can also use VS Code Live Server or `npx serve`.

**Do not open `index.html` directly with `file://`.** The application uses JavaScript ES modules, which browsers generally block when loaded from a local file URL.

## Firebase setup

### 1. Configure Authentication

1. Create or select a project in the [Firebase console](https://console.firebase.google.com/).
2. Register a Firebase Web app and copy its web-app configuration.
3. In **Authentication → Sign-in method**, enable **Email/Password**.
4. In **Authentication → Settings → Authorized domains**, add the hostnames used for local and deployed versions. Do not include URL paths.
5. Update the configuration in `js/auth/firebase-client.js`.
6. Run the site over HTTP(S) and test sign-up, email verification, sign-in, password reset, password change, and sign-out.

### 2. Configure Cloud Firestore progress

The application stores each signed-in user's progress at:

```text
users/{uid}/progress/overview
```

In the Firebase console, create a Cloud Firestore database and publish rules that restrict access to the authenticated user's own UID path. For example:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }
  }
}
```

Then:

1. Confirm the Firebase web configuration in `js/auth/firebase-client.js`.
2. Deploy the site over HTTP(S).
3. Sign in with a verified account, visit modules, complete a quiz, and allow time for the debounced cloud write.
4. In Firestore's **Data** tab, confirm that `users/{your-auth-uid}/progress/overview` exists.
5. Sign in with the same account on another browser/device and verify that progress is restored. Test a different account to confirm progress remains isolated.

**Existing local progress:** the legacy `dcl.v2` localStorage key is not automatically assigned to a signed-in account because it has no Firebase UID. The account-specific cache uses `dcl.v2.user.{uid}`.

**Security:** Firebase web configuration is delivered to the browser and is not a server-side secret. Never place service-account private keys, Admin SDK credentials, or other server secrets in client code or commit them to Git. Firebase Security Rules should enforce access control. The example rules above enforce per-user ownership but do not validate the correctness of client-submitted scores or other fields; use stricter validation or trusted server-side checks if data must be tamper-resistant.

## Project structure

```text
.
├── index.html
├── favicon.png
├── css/
│   ├── tokens.css
│   ├── base.css
│   ├── layout.css
│   ├── components.css
│   ├── dashboard.css
│   ├── lab.css
│   ├── modules.css
│   ├── learning.css
│   ├── responsive.css
│   ├── login.css
│   ├── profile.css
│   └── module-specific stylesheets
└── js/
    ├── app.js                 Application entry point and module imports
    ├── auth/                  Firebase client and account flows
    ├── core/                  Shared state, storage, encoding, and UI helpers
    ├── simulations/           Protocol, error-control, and network models
    ├── app/                   Navigation, routing, search, progress, and theme
    ├── lab/                   End-to-end transmission lab
    └── modules/
        ├── registry.js
        ├── link-layer/
        ├── network-layer/
        ├── transport-layer/
        ├── application-layer/
        ├── advanced/
        └── learning/
```

## How the application is organised

- `index.html` loads `js/app.js` as a JavaScript ES module.
- `js/app.js` imports the learning modules. Each module registers itself through `regMod()` in `js/modules/registry.js`.
- The registry groups modules into the learning path and the router displays the selected module using the URL hash (for example, `#/m/http`).
- Module interfaces live in `js/modules/`; protocol and network models live in `js/simulations/`; shared helpers live in `js/core/`.
- The core transmission workflow is initialized from `js/lab/`.
- Account and cloud-progress functionality lives in `js/auth/` and the progress helpers in `js/app/`.

### Add a learning module

1. Create a file under the appropriate `js/modules/<area>/` directory.
2. Import `regMod` from `../registry.js` and register a module with an `id`, `group`, `title`, `desc`, and `mount(root)`.
3. Import the new module file in `js/app.js` so it registers at startup.
4. Test navigation into and out of the module. If it creates timers or external event listeners, return a cleanup function from `mount(root)`.

### Common change locations

| Task | Location |
| --- | --- |
| Change a module's UI or interactions | `js/modules/<area>/<module>.js` |
| Change protocol or simulation logic | `js/simulations/<topic>.js` |
| Change the core transmission workflow | `js/lab/` and related simulation files |
| Change module groups or ordering | `js/modules/registry.js` and imports in `js/app.js` |
| Change colours, typography, or theme tokens | `css/tokens.css` |
| Change shared controls and component styles | `css/components.css` |
| Change sign-in and account flows | `js/auth/login.js` |
| Change Firebase initialization | `js/auth/firebase-client.js` |
| Change account/login presentation | `index.html`, `css/login.css`, and `css/profile.css` |
| Change tutorials, quizzes, or glossary | `js/modules/learning/` |

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Blank page or CORS/module errors | Start a local HTTP server; do not use `file://`. |
| A JavaScript file returns 404 | Check import paths and file names; relative imports must point to the correct `.js` file. |
| “does not provide an export named …” | Confirm that the export exists and the import name/path matches. |
| Sign-in says the domain is unauthorized | Add the hostname in Firebase Authentication → Settings → Authorized domains. |
| Email/password sign-in is unavailable | Enable Email/Password in Firebase Authentication → Sign-in method. |
| Authentication configuration error | Check `js/auth/firebase-client.js` against the Firebase Web app configuration. |
| Firestore `permission-denied` | Verify that the user is signed in and the rules allow access only to that user's UID path. |
| Progress differs between devices | Confirm both devices use the same Firebase project and account, then inspect `users/{uid}/progress/overview`. |
| Old progress appears during testing | Check the account-specific `dcl.v2.user.{uid}` cache and the Firestore document. The legacy global cache is not automatically imported. |
| Cryptography features are unavailable | Use HTTPS or localhost and a browser that supports the Web Crypto API. |
| CSS changes do not appear | Hard-refresh the page to bypass cached stylesheets. |

## Manual smoke-test checklist

Before publishing a change, test the affected feature and the main application flow:

1. Start the local server and confirm the page loads without console errors.
2. Visit each sidebar group and test browser Back/Forward navigation.
3. In the core lab, try text and each supported file type, packet-size changes, packet loss, corruption, retries, and stopping a transmission.
4. In Error Detection & Correction, test detection methods and the Hamming, two-dimensional parity, and Reed–Solomon correction examples.
5. Exercise TCP/UDP, handshake, congestion control, sockets, subnetting, routing, DNS, HTTP/TLS, and encryption demonstrations.
6. In the topology and Wi-Fi simulators, add, edit, and remove elements and verify that the displayed results update.
7. In the firewall lab, add and reorder rules, test packets, and compare policy results.
8. Switch the theme, reload, and confirm that it persists. Collapse and restore the desktop sidebar and check mobile navigation.
9. Sign in and confirm Firestore progress loads before the learning interface opens.
10. Visit modules and finish a quiz; verify progress syncs and restores on another device.
11. Sign out, sign in as a different user, and confirm the first user's progress is not shown or uploaded to the second account.
12. Test offline behaviour; local changes should remain cached, and a failed cloud read must not trigger a blind overwrite.

## Simulation limitations

- The Network Performance Analyzer uses a simplified, seeded model. Its outputs are estimates from the selected parameters; it does not measure the live internet connection or transmit real packets.
- The Wi-Fi simulator uses simplified signal and interference scores. These are educational approximations, not dBm measurements, live scans, or predictions of actual throughput. Security options are labels in the simulation and do not configure or encrypt a real wireless network.
- The firewall lab evaluates sample packets against an in-browser stateless rule set. It does not modify the device or network firewall and does not track real connections.
- The HTTP, DNS, routing, and other network scenarios are educational models, not real remote services.

## Contributing

Keep protocol logic separate from DOM rendering where practical, reuse shared helpers and design tokens, and avoid duplicating shared state. Keep changes focused and test the affected module as well as navigation before committing.

## Glossary

- **ARQ:** Automatic Repeat reQuest; error-control techniques that use acknowledgements and retransmissions.
- **CRC:** Cyclic Redundancy Check; an error-detection technique based on polynomial division.
- **DOM:** Document Object Model; the browser's representation of a page.
- **ES module:** A JavaScript file that shares functionality through `import` and `export`.
- **Hash routing:** Using the URL fragment (the part after `#`) to select a screen without a full page reload.
- **TLS:** Transport Layer Security; a protocol for protecting data in transit.

## Game layer (new look)

The interface is now a game-style shell around the existing modules. Nothing in `js/modules/`, `js/simulations/`, `js/core/` or `js/lab/` was rewritten.

- **Flow:** every quiz module runs Watch → Play → Quiz → Reward. *Play* is the module's own `mount(root)`. Add `/play` to a module URL (`#/m/dns/play`) for free play with no quiz and no XP.
- **Screens:** home map (`#/`), zones (`#/zone/<id>`), profile and badges (`#/profile`), daily challenge (`#/daily`).
- **Themes:** light = Sticker, dark = Game tiles. Both are token overrides in `css/game.css`, so every simulator is restyled automatically.
- **Code:** `js/game/data.js` (zones, difficulty, Watch scenes, quizzes), `rules.js` (pure XP, medal, level and streak rules), `store.js` (saves into the existing progress object, so Firebase sync keeps working), `flow.js`, `screens.js`, `ui.js`.
- **Add a quiz to a module:** add an entry to `META` in `js/game/data.js` (`z` zone, `d` difficulty, `e` emoji, `w` Watch scene, `q` five `question|correct|wrong|wrong` strings).
- **Tests:** `node --test tests/rules.test.mjs`
