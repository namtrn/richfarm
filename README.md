# Richfarm 🌿

Richfarm is a premium, comprehensive garden management application designed to help you plan, grow, and harvest your plants with ease. Whether you are a beginner or an experienced urban gardener, Richfarm provides the tools and information you need to maintain a thriving garden.

## ✨ Features

-   **🌱 Garden & Bed Management**: Organize your planting spaces into multiple gardens and beds.
-   **📅 Smart Planning**: track your plant lifecycle from planning to growing to harvest.
-   **🔔 Actionable Reminders**: Never miss a watering or fertilizing task with smart, localized notifications.
-   **📚 Extensive Plant Library**: Access a curated collection of plants with detailed care instructions.
-   **🌍 Multilingual Support**: Fully localized UI and content supporting 6 languages (English, Vietnamese, Spanish, Portuguese, French, Chinese).
-   **🍯 Preservation Recipes**: Learn how to preserve your harvest with recipes for drying, fermenting, and more.
-   **🎨 Premium Aesthetics**: A modern, responsive design built with NativeWind and Lucide icons.

## 🛠️ Tech Stack

-   **Frontend**: React Native (Expo)
-   **Backend**: [Convex](https://www.convex.dev/) (Real-time DB & Functions)
-   **Styling**: NativeWind (Tailwind CSS for React Native)
-   **Navigation**: Expo Router
-   **Localization**: i18next & Expo Localization
-   **Icons**: Lucide React Native

## 🚀 Getting Started

### Prerequisites

-   Node.js (LTS version)
-   npm or bun
-   Expo Go app on your mobile device (for development)

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/namtrn/richfarm.git
    cd richfarm
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Set up Convex**:
    Initialize your Convex project and start the development server:
    ```bash
    npx convex dev
    ```
    This will create a `.env.local` file with your Convex URL.

4.  **Start the app**:
    ```bash
    npm run ios # for iOS
    # or
    npm run android # for Android
    # or
    npm start # for Expo menu
    ```

## 🤖 UI Smoke Test (Maestro)

1. Install Maestro CLI (macOS):
   ```bash
   brew install maestro
   ```
2. Start the app on iOS simulator:
   ```bash
   npm run ios
   ```
3. In another terminal, run the smoke flow:
   ```bash
   npm run test:smoke:ios
   ```

## 📂 Project Structure

-   `app/`: Main application screens and routing logic using Expo Router.
-   `components/`: Reusable UI components.
-   `convex/`: Backend functions, schema, and database triggers.
-   `docs/specs/`: Product and technical specifications.
-   `docs/reports/`: Reviews, daily reports, and audits.
-   `features/`: Feature-slice modules (domain-specific components and hooks).
-   `hooks/`: Custom React hooks for global state and data fetching.
-   `lib/`: Core utilities, internationalization setup, and constants.
-   `modules/`: Feature-specific modules.
-   `scripts/`: Project automation and setup scripts.
-   `widgets/`: Specialized UI widgets.

## 🌐 Localization (i18n)

Richfarm prioritizes global accessibility. UI strings are managed via `i18next` in `lib/locales/`, while plant and recipe content are served dynamically based on the user's locale from Convex i18n tables.

For more details, see [LOCALIZATION.md](./docs/specs/LOCALIZATION.md) and [Plant Multilingual Data Solution](./docs/specs/plant-multilingual-data-solution.md).

## 📄 Documentation

-   [Business Requirements (BRD)](./docs/specs/BA_REQUIREMENTS.md)
-   [BA User Stories](./docs/specs/BA_USER_STORIES.md)
-   [Functional Plan](./docs/specs/APP_FUNCTIONAL_PLAN.md)
-   [My Garden Specification](./docs/specs/MY_GARDEN_SPEC.md)
-   [Unit System Specification](./docs/specs/UNIT_SYSTEM.md)
-   [Image Storage Strategy](./docs/specs/image-storage-strategy.md)

## ✅ Requirements Source Of Truth

-   `README.md` is an onboarding and developer guide.
-   BA-level requirements live in:
-   `docs/specs/BA_REQUIREMENTS.md`
-   `docs/specs/BA_USER_STORIES.md`
-   Detailed supporting specs live in:
-   `docs/specs/APP_FUNCTIONAL_PLAN.md`
-   `docs/specs/MY_GARDEN_SPEC.md`

## 🤝 Contributing

Contributions are welcome! Please read our [Functional Plan](./docs/specs/APP_FUNCTIONAL_PLAN.md) to understand the product scope before submitting pull requests.

## 📝 License

This project is private and proprietary.
