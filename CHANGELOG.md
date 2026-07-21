# Changelog

## Unreleased

- Hardened server request handling with body-size, prompt-size, CORS,
  concurrency, and in-memory rate-limit controls.
- Added provider-request cancellation for HTTP client disconnects.
- Separated server authentication credentials from provider credentials.
- Added optional identity and thread-authorization hooks for multi-tenant apps.
- Replaced insecure reasoning encryption with AES-256-GCM.
- Removed the in-process VM code-execution tool; code execution must be supplied
  by an externally isolated tool implementation.
