"""LOCAL TEST ONLY. Requires Python cryptography; keys stay in ignored .local/."""
from pathlib import Path
from datetime import datetime, timedelta, timezone
from ipaddress import ip_address
from cryptography import x509
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa

root = Path('.local/pilot-mqtt')
root.mkdir(parents=True, exist_ok=True)
if any(root.iterdir()):
    raise SystemExit('Refusing to overwrite existing certificates')
now = datetime.now(timezone.utc)
key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'Meterwerk local test CA')])
ca = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
      .serial_number(x509.random_serial_number()).not_valid_before(now-timedelta(minutes=1))
      .not_valid_after(now+timedelta(days=2)).add_extension(x509.BasicConstraints(ca=True, path_length=0), True)
      .sign(key, hashes.SHA256()))
(root/'ca.crt').write_bytes(ca.public_bytes(serialization.Encoding.PEM))
crl = x509.CertificateRevocationListBuilder().issuer_name(name).last_update(now).next_update(now+timedelta(days=2)).sign(key, hashes.SHA256())
(root/'ca.crl').write_bytes(crl.public_bytes(serialization.Encoding.PEM))
for identity in ['server','alpha','beta','meterwerk-ingestion']:
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    builder = (x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,identity)]))
               .issuer_name(name).public_key(private.public_key()).serial_number(x509.random_serial_number())
               .not_valid_before(now-timedelta(minutes=1)).not_valid_after(now+timedelta(days=1))
               .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH if identity=='server' else ExtendedKeyUsageOID.CLIENT_AUTH]),False))
    if identity=='server':
        builder=builder.add_extension(x509.SubjectAlternativeName([x509.DNSName('localhost'),x509.IPAddress(ip_address('127.0.0.1'))]),False)
    (root/f'{identity}.crt').write_bytes(builder.sign(key,hashes.SHA256()).public_bytes(serialization.Encoding.PEM))
    (root/f'{identity}.key').write_bytes(private.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
print('Local test certificates created; valid for one day; do not deploy to a pilot site.')
