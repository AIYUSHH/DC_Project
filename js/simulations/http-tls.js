/**
 * simulated web server for the HTTP and TLS module
 *
 * A tiny in-memory web server: a table of routes and httpServe(), which turns a request (method, path,
 * body) into a status code, headers and body, including redirects, 404 and 405 responses.
 *
 * Imports:
 *   - ../core/encoding.js (bytes, hex, bits and UTF-8 helpers): bytesOf
 *
 * Exports: HTTP_ROUTES, STATUS_CLASS, STATUS_TEXT, httpServe
 *
 * Used by: modules/application-layer/http-tls.js
 */

import { bytesOf } from '../core/encoding.js';

/**
 * The virtual site: path -> method -> [status, content type, body, extra headers].
 */
export const HTTP_ROUTES = {
  '/': { GET: [200, 'text/html', '<h1>Welcome</h1><p>Hello from the lab server.</p>'] },
  '/index.html': { GET: [200, 'text/html', '<h1>Welcome</h1><p>Hello from the lab server.</p>'] },
  '/about': { GET: [200, 'text/html', '<h1>About</h1><p>A tiny pretend web server.</p>'] },
  '/old': { GET: [301, 'text/html', '', { Location: '/about' }] },
  '/api/users': {
    GET: [200, 'application/json', '[{"id":1,"name":"Ada"},{"id":2,"name":"Alan"}]'],
    POST: [201, 'application/json', '{"id":3,"created":true}', { Location: '/api/users/3' }],
  },
  '/secret': {
    GET: [
      401,
      'text/plain',
      'Authentication required.',
      { 'WWW-Authenticate': 'Basic realm="lab"' },
    ],
  },
  '/error': { GET: [500, 'text/plain', 'Something broke on the server.'] },
};

/**
 * Status code -> reason phrase.
 */
export const STATUS_TEXT = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  301: 'Moved Permanently',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  500: 'Internal Server Error',
};

/**
 * First digit of a status code -> plain-English meaning of the class.
 */
export const STATUS_CLASS = {
  2: 'Success: the request worked.',
  3: 'Redirection: the client must look elsewhere.',
  4: 'Client error: the request was wrong.',
  5: 'Server error: the server failed.',
};

/**
 * Answers an HTTP request using the in-memory routes.
 *
 * @param {string} method
 * @param {string} path
 * @param {string} [body]
 * @returns {{code:number, headers:Object, text:string, body:string}} text is the complete raw response (status line, headers, blank line, body).
 */
export function httpServe(method, path, body) {
  const r = HTTP_ROUTES[path],
    m = method === 'HEAD' ? 'GET' : method;
  let code,
    type = 'text/plain',
    text = '',
    extra = {};
  if (!r) {
    code = 404;
    text = 'No such page.';
  } else if (!r[m]) {
    code = 405;
    text = 'Method not allowed.';
    extra = { Allow: Object.keys(r).join(', ') };
  } else {
    [code, type, text, extra = {}] = r[m];
    if (method === 'POST' && !body.trim()) {
      code = 400;
      text = 'POST needs a body.';
      type = 'text/plain';
      extra = {};
    }
  }
  const head = [
    `HTTP/1.1 ${code} ${STATUS_TEXT[code] || ''}`,
    'Server: lab/1.0',
    'Date: Sat, 24 Oct 2026 12:00:00 GMT',
    `Content-Type: ${type}`,
    `Content-Length: ${bytesOf(text).length}`,
    ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`),
    'Connection: keep-alive',
  ];
  return {
    code,
    headers: extra,
    text: head.join('\r\n') + '\r\n\r\n' + (method === 'HEAD' ? '' : text),
    body: text,
  };
}
