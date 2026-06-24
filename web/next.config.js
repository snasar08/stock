/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["ffmpeg-static", "ffprobe-static"],
    outputFileTracingIncludes: {
      "/api/probe": [
        "./node_modules/ffmpeg-static/ffmpeg",
        "./node_modules/ffprobe-static/bin/linux/x64/ffprobe",
      ],
      "/api/chunk": [
        "./node_modules/ffmpeg-static/ffmpeg",
        "./node_modules/ffprobe-static/bin/linux/x64/ffprobe",
      ],
    },
  },
};

module.exports = nextConfig;
