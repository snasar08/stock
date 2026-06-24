/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["ffmpeg-static", "ffprobe-static"],
    outputFileTracingIncludes: {
      "/api/probe": ["./node_modules/ffmpeg-static/**/*", "./node_modules/ffprobe-static/**/*"],
      "/api/chunk": ["./node_modules/ffmpeg-static/**/*", "./node_modules/ffprobe-static/**/*"],
    },
  },
};

module.exports = nextConfig;
