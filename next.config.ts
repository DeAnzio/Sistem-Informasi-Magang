import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Isolasi build pengujian HTTP dari server lokal dan build rilis.
  distDir: process.env.PORTAL_TEST_BUILD === '1' ? '.next-portal-test'
    : process.env.PORTAL_LOCAL_BUILD === '1' ? '.next-portal-local' : '.next',
};

export default nextConfig;
