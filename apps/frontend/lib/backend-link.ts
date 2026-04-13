const DEFAULT_BACKEND_BASE_URL = 'https://voice-calling-assistant.onrender.com';

export function getBackendBaseUrl(override?: string) {
  return override ?? DEFAULT_BACKEND_BASE_URL;
}

export function getBackendLinkLabel() {
  return 'Online';
}
