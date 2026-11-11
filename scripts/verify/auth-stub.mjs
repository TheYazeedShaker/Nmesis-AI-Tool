// Stand-in for '@/app/chatgpt-auth', used only by scripts/verify (see hooks.mjs):
// every request is the same synthetic, signed-in test owner.
export const USER={userId:'google-email:owner@example.test',displayName:'Test Owner',email:'owner@example.test',fullName:'Test Owner'};
export async function getChatGPTUser(){return USER}
export async function requireChatGPTUser(){return USER}
export function chatGPTSignInPath(){return '/'}
export function chatGPTSignOutPath(){return '/'}
