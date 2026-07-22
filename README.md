<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1QAwRjaqrbz5t29oXuGBt28inkJz7xcRP

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`
3. In the app, click the **settings (⚙️) icon** in the header and paste in your
   own [Gemini API key](https://aistudio.google.com/apikey) to enable the AI
   learning assistant.

The API key is entered at runtime and stored only in your browser's
`localStorage` — it is never baked into the build, so it's never exposed in
the deployed JS bundle to other visitors of a hosted copy of this app. AI
features are optional; the editor, mind map, and file explorer all work
without a key.
