# Node TLS integration fixture

`localhost-cert.pem` is a self-signed test CA/server certificate for `127.0.0.1` and `localhost`. The corresponding key is public fixture data and is never used by production startup. Tests explicitly trust this certificate only in their isolated child processes; the untrusted parent must reject it.

The fixture was generated with OpenSSL using `req -x509 -newkey rsa:2048 -nodes -days 36500`, the subject `CN=hbar-node-test-only`, localhost SANs, a critical CA basic constraint, digital-signature/key-encipherment/certificate-signing key usage, and server-auth extended key usage. Keep certificate validation enabled when changing these tests.
