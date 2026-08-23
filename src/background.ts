chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.type === 'set-fire-icon') {
    //set icon to fire then back to normal after 2 second

    chrome.action.setIcon(
      {
        path: '../../icon-fire-96x96.gif',
      },
      () => {
        setTimeout(() => {
          chrome.action.setIcon({
            path: '../../logo96.png',
          });
        }, 5000);
      },
    );
  }
  /* Will be used if we want to get messages from content scripts to background script */
  sendResponse({ status: 'OK' });
});
const LEETCODE_SESSION_COOKIE = 'LEETCODE_SESSION';
const SESSION_WRITE_DEBOUNCE_MS = 1000;

let pendingSession: string | null = null;
let flushScheduled = false;

/**
 * Persists the LeetCode session cookie, coalescing bursts.
 *
 * chrome.storage.sync permits 120 writes per minute. LeetCode refreshes this
 * cookie on many requests and Chrome reports every update as a removal plus an
 * insertion, so writing on each event trips MAX_WRITE_OPERATIONS_PER_MINUTE.
 * Once the quota is blown the write that matters is rejected too, leaving
 * `leetcode_session` unset, and LeetCodeHandler.getSubmission then returns null
 * for every submission without surfacing an error.
 */
const storeLeetcodeSession = (value: string | null) => {
  pendingSession = value;
  if (flushScheduled) return;
  flushScheduled = true;

  setTimeout(() => {
    flushScheduled = false;
    const next = pendingSession;

    chrome.storage.sync.get('leetcode_session', (current) => {
      if (chrome.runtime.lastError) {
        console.warn('LeetSync: could not read stored session:', chrome.runtime.lastError.message);
        return;
      }
      // Re-writing an unchanged value still counts against the quota.
      if (current?.leetcode_session === next) return;

      chrome.storage.sync.set({ leetcode_session: next }, () => {
        if (chrome.runtime.lastError) {
          console.warn('LeetSync: could not store session:', chrome.runtime.lastError.message);
          return;
        }
        console.log('LeetSync: LeetCode session stored.');
      });
    });
  }, SESSION_WRITE_DEBOUNCE_MS);
};

chrome.cookies.get({ name: LEETCODE_SESSION_COOKIE, url: 'https://leetcode.com/' }, (cookie) => {
  if (!cookie) return;
  storeLeetcodeSession(cookie.value);
});

chrome.cookies.onChanged.addListener((info) => {
  if (info.cookie.name !== LEETCODE_SESSION_COOKIE) return;
  // Chrome reports an update as a removal (cause 'overwrite') followed by an
  // insertion. Acting on the removal half would clear a session that is about
  // to be replaced, and doubles the number of writes.
  if (info.removed && info.cause === 'overwrite') return;
  storeLeetcodeSession(info.removed ? null : info.cookie.value);
});
chrome.storage.sync.onChanged.addListener((changes) => {
  console.log(`🚀 ~ file: background.ts:68 ~ changes:`, JSON.stringify(changes, null, 2));
});

export const sendMessageToContentScript = (type: string, data: any) => {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs.length || !tabs[0].id) return;
    chrome.tabs.sendMessage(tabs[0].id, { type, data }, function (response) {
      if (chrome.runtime.lastError) {
        console.log(chrome.runtime.lastError.message);
        // Handle the error here
        return;
      }
      console.log(`✅ Acknowledged`, response);
    });
  });
};

// Listen for submit request
chrome.webRequest.onCompleted.addListener(
  (details: chrome.webRequest.WebResponseCacheDetails) => {
    // Check if it's a POST request to submit the code
    if (
      details.method === 'POST' &&
      details.url.startsWith('https://leetcode.com/problems/') &&
      details.url.includes('/submit/')
    ) {
      const questionSlug = details.url.match(/\/problems\/(.*)\/submit/)?.[1] ?? null;
      if (!questionSlug) return;
      // Wait 5 secs to complete the checks
      // Send a message to the content script to get the submission
      setTimeout(() => {
        sendMessageToContentScript('get-submission', { questionSlug });
      }, 5000);
    }
  },
  {
    urls: ['https://leetcode.com/problems/*/submit/'],
    types: ['xmlhttprequest'],
  },
);
export {};
