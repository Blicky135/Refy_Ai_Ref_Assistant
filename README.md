## **Inspiration**

As referees ourselves, we constantly struggled with juggling a stopwatch, cards, scores, and remembering important match events — all while trying to stay focused on the field. Most existing referee apps were either too complicated or required internet access, which isn’t realistic during real matches.
So we built **Refy**, a simple, offline-first tool created *by referees, for referees*, to make match management faster, cleaner, and less stressful.

---

## **What We Learned**

Throughout the project, we learned how to:

* Build a fully offline **Progressive Web App (PWA)**
* Use localStorage effectively to persist structured match data
* Design a smooth match-flow system with halves, kickoff selection, and stoppage time
* Structure a React application with reusable hooks and components
* Integrate a real-time **AI assistant** and clean its responses
* Build UI/UX specifically optimized for fast, in-game tapping

We also gained experience collaborating under hackathon time pressure and balancing simplicity with referee-level functionality.

---

## **How We Built It**

We built Refy using:

* **React + TypeScript** for the main application
* **Vite** for fast development + PWA support
* **Tailwind CSS** for clean, responsive UI
* **Custom React hooks** (`useTimer`, `useLocalStorage`) for core logic
* **localStorage** to store match data, settings, and match history
* **Gemini API** to power the AI rule assistant
* **PWA features** to make the app installable and fully functional offline

All match logic — score, cards, timer, halves, and event logging — is managed directly in the frontend with no backend required.

---

## **Challenges**

We faced several key challenges:

* Designing a countdown system that handles vibration, stoppage time, and half transitions smoothly
* Ensuring the app stays fully offline while still being fast and stable
* Creating intuitive UI flows for kickoff selection, card input, and half transitions
* Managing a detailed event log without a backend database
* Making the app PWA-compatible without breaking state persistence
* Cleaning AI responses so they look professional, readable, and referee-friendly

Each challenge helped us improve the usability and reliability of the final product.

---

* **React**
* **TypeScript**
* **Vite**
* **Tailwind CSS**
* **LocalStorage**
* **PWA (service worker + manifest)**
* **Gemini API**
