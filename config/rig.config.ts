/**
 * RIG CONFIGURATION FILE
 *
 * This is the main configuration file for your miner miniapp.
 * Edit the values below to customize your deployment.
 */

export const rigConfig = {
  // ============================================
  // REQUIRED: Your rig contract address on Base
  // ============================================
  rigAddress: "0x0000000000000000000000000000000000000000" as `0x${string}`,

  // ============================================
  // BRANDING
  // ============================================
  branding: {
    // App name shown in header and metadata
    appName: "My Token Miner",

    // Short tagline for the miniapp
    tagline: "Mine with us!",

    // Theme colors (hex format)
    colors: {
      // Primary color - used for buttons, accents, highlights
      primary: "#a06fff",
      // Darker shade - used for hover states
      primaryDark: "#8a5fe6",
      // Lighter shade - used for glows and subtle accents
      primaryLight: "#b48aff",
    },
  },

  // ============================================
  // INFO PAGE CONTENT
  // ============================================
  projectInfo: {
    // Sections displayed on the /info page
    sections: [
      {
        title: "What is this token?",
        content: "This is a mineable token launched on the Miner Launchpad. Mine it, trade it, and join the community!",
        bullets: [
          "Fair launch - no presale, no team allocation",
          "Mining rewards distributed to active participants",
          "Fully on-chain, decentralized tokenomics",
        ],
      },
      {
        title: "How to mine?",
        content: "Mining is simple:",
        bullets: [
          "Connect your wallet via Farcaster",
          "Click the MINE button and confirm the transaction",
          "Earn tokens based on the current mining rate",
          "The more you mine, the more you earn!",
        ],
      },
      {
        title: "Tokenomics",
        content: "The token follows a halving schedule similar to Bitcoin, with decreasing emission rates over time.",
        bullets: [],
      },
    ],

    // Social links shown on the /info page
    links: {
      website: "",        // e.g., "https://mytoken.com"
      twitter: "",        // e.g., "mytokenhandle" (without @)
      telegram: "",       // e.g., "mytokenchat" (without t.me/)
      discord: "",        // e.g., "https://discord.gg/invite"
      github: "",         // e.g., "https://github.com/mytoken"
    },
  },

  // ============================================
  // FARCASTER MINIAPP SETTINGS
  // ============================================
  farcaster: {
    // Name shown in Farcaster miniapp embed
    appName: "My Token Miner",

    // Button text in Farcaster embed
    buttonTitle: "Start Mining!",

    // Your deployed domain (for og images and embeds)
    // Update this after deploying to Vercel
    domain: "your-app.vercel.app",
  },

  // ============================================
  // OPTIONAL SETTINGS
  // ============================================

  // Wallet to receive swap fees (0.4% of trades)
  // Set to zero address to disable fees
  swapFeeRecipient: "0x0000000000000000000000000000000000000000" as `0x${string}`,
};

// Type export for use in components
export type RigConfig = typeof rigConfig;
