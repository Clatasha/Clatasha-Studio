// External sticker packs live here so new categories can be added without
// expanding the main editor file. Each pack describes a folder and its colors.

function numberedStickerPack({
  id,
  label,
  folder,
  count,
  digits = 2,
  titlePrefix,
  targetSize = 650,
  colorsForItem,
}) {
  return {
    id,
    label,
    items: Array.from({ length: count }, (_, index) => {
      const number = index + 1;
      const fileNumber = String(number).padStart(digits, '0');
      return {
        id: `${id}-${fileNumber}`,
        title: `${titlePrefix} ${number}`,
        asset: `../assets/stickers/${folder}/${fileNumber}.svg`,
        targetSize,
        colors: colorsForItem(number),
      };
    }),
  };
}

function titleFromFilename(filename) {
  return filename
    .replace(/\.svg$/i, '')
    .replace(/^\d+-/, '')
    .split('-')
    .map(word => word ? word[0].toUpperCase() + word.slice(1) : '')
    .join(' ');
}

function namedStickerPack({ id, label, folder, files, targetSize = 360 }) {
  return {
    id,
    label,
    items: files.map(filename => ({
      id: `${id}-${filename.replace(/\.svg$/i, '').toLowerCase()}`,
      title: titleFromFilename(filename),
      asset: `../assets/stickers/${folder}/${filename}`,
      targetSize,
    })),
  };
}

export const STICKER_ASSET_PACKS = [
  numberedStickerPack({
    id: 'background-shapes',
    label: 'Backgrounds',
    folder: 'background-shapes',
    count: 52,
    titlePrefix: 'Background Shape',
    targetSize: 650,
    colorsForItem: number => number === 52
      ? [
          { label: 'Primary', source: '#5e4a6e' },
          { label: 'Accent', source: '#ececee' },
        ]
      : [{ label: 'Color', source: '#5e4a6e' }],
  }),
  namedStickerPack({
    id: 'youtube',
    label: 'YouTube',
    folder: 'youtube',
    targetSize: 360,
    files: [
      '01-light-bulb-idea-imagination-creativity.svg',
      '02-camera-recorder-upload-video.svg',
      '03-game-gaming.svg',
      '04-upload-video-cloud.svg',
      '05-gaming-logo.svg',
      '06-premiere-video-blog-public-speech-show.svg',
      '07-viral-video-bomb-hot-new-product.svg',
      '08-online-screencast-web-conference-live.svg',
      '09-video-slides-layers-player-ui.svg',
      '10-video-logo-play-icon.svg',
      '11-video-archive-collection-hosting.svg',
      '12-red-paint-brush.svg',
      '13-microphone-audio-mic-recording.svg',
      '14-mobile-video-play-player.svg',
      '15-likes-dislikes-thumbs-up-down-gesture.svg',
      '16-thumbs-up-like-gesture.svg',
      '17-video-360-panorama.svg',
      '18-video-player-ui-play-browser.svg',
      '19-video-3d-panorama.svg',
      '20-camera-video-photo-recording-device.svg',
      '21-target-audience-followers-subscribers.svg',
      '22-evil-hate-monster-viral-product.svg',
      '23-box-empty-play-button-video.svg',
      '24-instagram-camcorder-go-pro-portable.svg',
      '25-lab-viral-video-ad-creativie.svg',
      '26-brain-idea-generator-mind-power.svg',
      '27-profile-user-follower-subscriber-persona.svg',
      '28-1k-thousand-views-followers-checkpoint.svg',
      '29-1m-million-views-red-button.svg',
      '30-bell-notifications-notice-notify-alert.svg',
      '31-red-tv-show-translation-live-broadcast.svg',
      '32-hot-finger-like-awesome-trend-fire.svg',
      '33-video-editor-films-production.svg',
      '34-locked-banned-content.svg',
      '35-storytelling-storyboard-scenario-script-screenplay.svg',
      '36-live-video-webinar-conference.svg',
      '37-video-editing-editor-slice-crop.svg',
    ],
  }),
];
