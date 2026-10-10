<?php
$host = "sql312.infinityfree.com";
$dbname = "if0_41623884_paginaweb";
$user = "if0_41623884";
$password = "ZzUQujJ06iE8Dtp";

try {
    $conexion = new PDO(
        "mysql:host=$host;dbname=$dbname;charset=utf8mb4",
        $user,
        $password
    );

    $conexion->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

} catch (PDOException $e) {
    die("Error de conexión: " . $e->getMessage());
}
?>