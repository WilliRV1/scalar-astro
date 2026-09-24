"""Genera .env con secretos nuevos para el entorno de prueba de Scalar."""
import base64, hashlib, hmac, json, secrets, time, os, sys

if os.path.exists('.env'):
    sys.exit('.env ya existe; no se sobrescribe.')

def b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()

def jwt(role: str, secret: str) -> str:
    now = int(time.time())
    h = b64(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())
    p = b64(json.dumps({'role': role, 'iss': 'supabase', 'iat': now, 'exp': now + 10 * 365 * 86400}).encode())
    s = b64(hmac.new(secret.encode(), f'{h}.{p}'.encode(), hashlib.sha256).digest())
    return f'{h}.{p}.{s}'

jwt_secret = secrets.token_hex(32)
env = {
    'PUBLIC_URL': 'https://scalar.widawi.online',
    'POSTGRES_PASSWORD': secrets.token_hex(24),
    'JWT_SECRET': jwt_secret,
    'ANON_KEY': jwt('anon', jwt_secret),
    'SERVICE_ROLE_KEY': jwt('service_role', jwt_secret),
}
with open('.env', 'w') as f:
    f.writelines(f'{k}={v}\n' for k, v in env.items())
os.chmod('.env', 0o600)
print('ok')
