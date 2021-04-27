export class Color {
    static colorHue: string = "";

    static colorHash(name: string, libtype: string = "") {
        // Return a color for the given name and library type. The library type
        // selects the hue, and the name is hashed to a color in that hue.

        var r
        var g
        var b

        // default when libtype is not in use
        var hue = Color.colorHue || 'warm'

        if (libtype) {
            if (libtype === 'Kernel') {
                hue = 'green'
            } else if (libtype === 'IO') {
                hue = 'red'
            } else if (libtype === 'File') {
                hue = 'yellow'
            } else if (libtype === 'JIT') {
                hue = 'purple'
            } else if (libtype === 'Networking') {
                hue = 'blue'
            }
        }

        // calculate hash
        var vector = 0
        if (name) {
            var nameArr = name.split('`')
            if (nameArr.length > 1) {
                name = nameArr[nameArr.length - 1] // drop module name if present
            }
            name = name.split('(')[0] // drop extra info
            vector = Color.generateHash(name)
        }

        // calculate color
        if (hue === 'red') {
            r = 200 + Math.round(55 * vector)
            g = 50 + Math.round(80 * vector)
            b = g
        } else if (hue === 'yellow') {
            r = 175 + Math.round(55 * vector)
            g = r
            b = 50 + Math.round(20 * vector)
        } else if (hue === 'green') {
            r = 50 + Math.round(60 * vector)
            g = 200 + Math.round(55 * vector)
            b = r
        } else if (hue === 'purple') {
            r = 100 + Math.round(27 * vector)
            g = 50 + Math.round(80 * vector)
            b = 200 + Math.round(55 * vector)
        } else if (hue === 'blue') {
            r = 30 + Math.round(10 * vector)
            g = r
            b = 200 + Math.round(55 * vector)
        } else {
            // original warm palette
            r = 200 + Math.round(55 * vector)
            g = 0 + Math.round(230 * (1 - vector))
            b = 0 + Math.round(55 * (1 - vector))
        }

        return 'rgb(' + r + ',' + g + ',' + b + ')'
    }

    static generateHash(name: string) {
        // Return a vector (0.0->1.0) that is a hash of the input string.
        // The hash is computed to favor early characters over later ones, so
        // that strings with similar starts have similar vectors. Only the first
        // 6 characters are considered.
        const MAX_CHAR = 6

        var hash = 0
        var maxHash = 0
        var weight = 1
        var mod = 10

        if (name) {
            for (var i = 0; i < name.length; i++) {
                if (i > MAX_CHAR) { break }
                hash += weight * (name.charCodeAt(i) % mod)
                maxHash += weight * (mod - 1)
                weight *= 0.70
            }
            if (maxHash > 0) { hash = hash / maxHash }
        }
        return hash
    }

}