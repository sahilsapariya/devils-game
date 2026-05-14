package config

import "crypto/rand"

// readRandom isolates the crypto/rand call so the rest of the package can be
// tested without entropy concerns.
func readRandom(b []byte) (int, error) {
	return rand.Read(b)
}
