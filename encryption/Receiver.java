import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class Receiver {

    // ==================================================================
    // CẤU HÌNH HẰNG SỐ (Khớp với Sender)
    // ==================================================================
    private static final String HKDF_INFO = "e2ee-chat-v1";
    private static final int TAG_BITS = 128;

    // ==================================================================
    // BƯỚC 1: X25519 - THỎA THUẬN KHÓA (TẠO SHARED SECRET)
    // ==================================================================
    static byte[] x25519(PrivateKey myPrivate, PublicKey senderPublic) throws GeneralSecurityException {
        KeyAgreement ka = KeyAgreement.getInstance("X25519");
        ka.init(myPrivate);
        ka.doPhase(senderPublic, true);
        return ka.generateSecret();
    }

    // ==================================================================
    // BƯỚC 2: HKDF-SHA256 - PHÁI SINH KHÓA AES TỪ SHARED SECRET
    // ==================================================================
    static byte[] hkdf(byte[] sharedSecret) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        
        mac.init(new SecretKeySpec(new byte[32], "HmacSHA256"));
        byte[] prk = mac.doFinal(sharedSecret);

        mac.init(new SecretKeySpec(prk, "HmacSHA256"));
        mac.update(HKDF_INFO.getBytes(StandardCharsets.UTF_8));
        mac.update((byte) 1);
        
        return mac.doFinal();
    }

    // ==================================================================
    // BƯỚC 3: AES-256-GCM - GIẢI MÃ CIPHERTEXT BẰNG KHÓA AES
    // ==================================================================
    static String aesGcmDecrypt(byte[] aesKey, byte[] iv, byte[] ciphertext) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        GCMParameterSpec spec = new GCMParameterSpec(TAG_BITS, iv);
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(aesKey, "AES"), spec);
        
        byte[] plaintext = cipher.doFinal(ciphertext);
        return new String(plaintext, StandardCharsets.UTF_8);
    }

    // ==================================================================
    // BƯỚC 4: HÀM TỔNG - XỬ LÝ GÓI JSON VÀ TRẢ VỀ VĂN BẢN GỐC
    // ==================================================================
    public static String receiveMessage(PrivateKey myPrivateKey, String jsonPayload) throws Exception {
        String ivB64 = extractJsonField(jsonPayload, "iv");
        String ciphertextB64 = extractJsonField(jsonPayload, "ciphertext");
        String senderPublicKeyB64 = extractJsonField(jsonPayload, "senderPublicKey");

        byte[] iv = Base64.getDecoder().decode(ivB64);
        byte[] ciphertext = Base64.getDecoder().decode(ciphertextB64);
        byte[] senderPublicKeyBytes = Base64.getDecoder().decode(senderPublicKeyB64);

        KeyFactory kf = KeyFactory.getInstance("X25519");
        PublicKey senderPublicKey = kf.generatePublic(new X509EncodedKeySpec(senderPublicKeyBytes));

        byte[] sharedSecret = x25519(myPrivateKey, senderPublicKey);
        byte[] aesKey = hkdf(sharedSecret);

        return aesGcmDecrypt(aesKey, iv, ciphertext);
    }

    // ==================================================================
    // HÀM PHỤ TRỢ: TRÍCH XUẤT TRƯỜNG DỮ LIỆU TỪ JSON
    // ==================================================================
    private static String extractJsonField(String json, String field) throws Exception {
        Matcher m = Pattern.compile("\"" + field + "\"\\s*:\\s*\"([^\"]+)\"").matcher(json);
        if (m.find()) return m.group(1);
        throw new Exception("Không tìm thấy trường '" + field + "' trong JSON");
    }

    // ==================================================================
    // CHẠY THỬ (TEST)
    // ==================================================================
    public static void main(String[] args) throws Exception {
        java.security.KeyPair myKeyPair = java.security.KeyPairGenerator.getInstance("X25519").generateKeyPair();

        // --- Giả lập tạo gói tin JSON từ Sender ---
        java.security.KeyPair senderKeyPair = java.security.KeyPairGenerator.getInstance("X25519").generateKeyPair();
        byte[] shared = x25519(senderKeyPair.getPrivate(), myKeyPair.getPublic());
        byte[] aes = hkdf(shared);
        
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        byte[] mockIv = new byte[12];
        new java.security.SecureRandom().nextBytes(mockIv);
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(aes, "AES"), new GCMParameterSpec(128, mockIv));
        byte[] mockCiphertext = cipher.doFinal("Bí mật E2EE thành công!".getBytes(StandardCharsets.UTF_8));
        
        String incomingJson = String.format(
            "{\"to\":\"quan\",\"iv\":\"%s\",\"ciphertext\":\"%s\",\"senderPublicKey\":\"%s\"}",
            Base64.getEncoder().encodeToString(mockIv),
            Base64.getEncoder().encodeToString(mockCiphertext),
            Base64.getEncoder().encodeToString(senderKeyPair.getPublic().getEncoded())
        );
        // ------------------------------------------

        System.out.println("JSON nhận được:\n" + incomingJson);
        String decryptedMessage = receiveMessage(myKeyPair.getPrivate(), incomingJson);
        System.out.println("\nĐã giải mã: " + decryptedMessage);
    }
}