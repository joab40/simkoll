const optimized = {
  '/assets/open-chat-bg.png': '/assets/open-chat-bg.jpg',
  '/assets/open-chat-bg-teal.png': '/assets/open-chat-bg-teal.jpg',
  '/assets/open-chat-bg-navy.png': '/assets/open-chat-bg-navy.jpg',
}

export const chatBackgroundUrl = (url) => optimized[url] || url
