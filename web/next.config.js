/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["ffmpeg-static", "ffprobe-static"],
  },
};

module.exports = nextConfig;
