# openStitch 🧵

**Build something | openStitch**

openStitch is an AI-powered UI generation tool that allows you to create app designs and React components simply by chatting with an AI. It supports multiple AI providers, including local models via Ollama, giving you full control over your generation stack.

## ✨ Features

* **💬 Chat-to-UI:** Describe the interface you want, and openStitch will generate the React (Tailwind CSS) code for it.
* **🤖 Multi-Provider Support:** Choose between industry-leading cloud models or run locally:
  * Google Gemini
  * OpenAI
  * Anthropic
  * Ollama (Local)
* **🎛️ Custom Model Selection:** Select specific models for cloud providers, or type in the exact name of your local Ollama model (e.g., `llama3`, `qwen2.5-coder`).
* **👀 Live Preview & Code Editor:** Instantly toggle between a live interactive preview of your generated UI and the underlying React code.
* **📁 Local Project Management:** Your projects and chat histories are saved locally in your browser.
* **📦 Export:** Download your generated screens as a `.zip` file to easily integrate them into your own codebase.

## 🚀 Getting Started

### Prerequisites

* Node.js (v18 or higher recommended)
* npm or yarn
* API Keys for your preferred cloud provider (Gemini, OpenAI, Anthropic) OR a local installation of [Ollama](https://ollama.com/).

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/openStitch.git
   cd openStitch
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:3000` (or the port specified by Vite).

## 🦙 Using Ollama (Local Models)

To use openStitch completely offline with local models, you need to configure Ollama to accept Cross-Origin Resource Sharing (CORS) requests from the openStitch web app.

1. Install [Ollama](https://ollama.com/) and download a model (e.g., `ollama run llama3`).
2. Stop the Ollama app if it's currently running.
3. Start the Ollama server via your terminal with the `OLLAMA_ORIGINS` environment variable set:

   **Mac/Linux:**
   ```bash
   OLLAMA_ORIGINS="*" ollama serve
   ```

   **Windows (Command Prompt):**
   ```cmd
   set OLLAMA_ORIGINS="*"
   ollama serve
   ```

   **Windows (PowerShell):**
   ```powershell
   $env:OLLAMA_ORIGINS="*"
   ollama serve
   ```
4. In openStitch, open the Settings (gear icon), select **Ollama (Local)** as the provider, enter your model name (e.g., `llama3`), and ensure the URL is set to `http://localhost:11434`.

## 🛠️ Tech Stack

* **Frontend Framework:** React 18
* **Styling:** Tailwind CSS
* **Language:** TypeScript
* **Build Tool:** Vite
* **Icons:** Lucide React

## 📝 License

MIT License
