'use strict';
// Additive foundation only. Existing names, identities, keys and ciphertext stay intact.
exports.up = async connection => {
    const [[settings]] = await connection.query('SELECT @@SESSION.sql_safe_updates AS safe_updates');
    await connection.query('SET SESSION sql_safe_updates = 0');
    try {
    const [friendColumns] = await connection.query("SHOW COLUMNS FROM friendships LIKE 'blocked_previous_status'");
    if (!friendColumns.length) {
        await connection.query("ALTER TABLE friendships ADD COLUMN blocked_previous_status ENUM('pending','accepted','rejected') NULL DEFAULT NULL");
        // Applies only when upgrading the earlier seven-table schema.
        await connection.query(`UPDATE friendships f SET blocked_previous_status='accepted'
            WHERE f.id IS NOT NULL AND f.status='blocked' AND f.blocked_previous_status IS NULL
            AND EXISTS (SELECT 1 FROM conversation_members a JOIN conversation_members b ON a.conversation_id=b.conversation_id
                WHERE a.user_id=f.user1_id AND b.user_id=f.user2_id)`);
    }
    await connection.query(`CREATE TABLE IF NOT EXISTS user_profiles (
        user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
        handle VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        date_of_birth DATE DEFAULT NULL,
        phone_e164 VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
        phone_verified_at TIMESTAMP(6) NULL DEFAULT NULL,
        avatar_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
        bio VARCHAR(300) NOT NULL DEFAULT '',
        show_phone BOOLEAN NOT NULL DEFAULT FALSE,
        show_birthday BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE KEY uq_profile_handle (handle),
        CONSTRAINT fk_profile_user FOREIGN KEY (user_id) REFERENCES users(id),
        CONSTRAINT chk_profile_handle CHECK (handle REGEXP '^[a-z0-9_]{3,40}$')
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    const [columns] = await connection.query('SHOW COLUMNS FROM user_profiles');
    const required = ['user_id','handle','display_name','date_of_birth','phone_e164','phone_verified_at','avatar_key','bio','show_phone','show_birthday','created_at','updated_at'];
    if (required.some(name => !columns.some(column => column.Field === name))) throw new Error('Existing user_profiles table is incompatible');
    await connection.beginTransaction();
    try {
        await connection.query(`INSERT INTO user_profiles (user_id,handle,display_name)
            SELECT u.id, CONCAT('u_',REPLACE(LOWER(u.id),'-','')), u.username FROM users u
            WHERE NOT EXISTS (SELECT 1 FROM user_profiles p WHERE p.user_id=u.id)`);
        await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    } finally { await connection.query('SET SESSION sql_safe_updates = ?', [Number(settings.safe_updates) === 1 ? 1 : 0]); }
};
