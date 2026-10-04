import { Head, Html, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="zh-Hant-TW">
      <Head>
        <link rel="preconnect" href="https://apis.youbike.com.tw" crossOrigin="" />
        <meta name="theme-color" content="#f7f6f2" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="YouBike 即時" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <script src="/theme-init.js" />
        <link
          rel="icon"
          href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23ffd400'/%3E%3Ccircle cx='10' cy='21' r='5' fill='none' stroke='%23231f20' stroke-width='2.4'/%3E%3Ccircle cx='23' cy='21' r='5' fill='none' stroke='%23231f20' stroke-width='2.4'/%3E%3Cpath d='M10 21l4-8h5l3 8' fill='none' stroke='%23231f20' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M14 13l-2-3h-3' fill='none' stroke='%23231f20' stroke-width='2.4' stroke-linecap='round'/%3E%3C/svg%3E"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
