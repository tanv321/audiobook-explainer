module.exports = {
    globDirectory: "build/",
    globPatterns: ["**/*.{js,css,html,png,jpg,svg,mp3,wav}"],
    swDest: "build/service-worker.js",
    clientsClaim: true,
    skipWaiting: true,
  };