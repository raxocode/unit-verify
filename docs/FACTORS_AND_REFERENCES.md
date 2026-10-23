# Conversion Factors, Derivations, and References

## Standards Citations

1. **NIST SP 811 (2008 Edition / current)**:  
   *Guide for the Use of the International System of Units (SI)*, Appendix B: Conversion Factors.  
   https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors  
   Source identifier in catalog: `nist-sp811`

2. **BIPM SI Brochure (9th Edition, 2019)**:  
   *The International System of Units (SI)*, Bureau International des Poids et Mesures.  
   https://www.bipm.org/en/publications/si-brochure  
   Source identifier in catalog: `bipm-si`

3. **IEC 80000-13:2008**:  
   *Quantities and units — Part 13: Information science and technology*. Defines binary prefix multipliers (KiB = 1024 B, MiB = 1048576 B) and distinguishes them from decimal prefixes (kB = 1000 B, MB = 1000000 B).  
   Source identifier in catalog: `iec-80000-13`

---

## Exact vs. Derived Definitions

### 1. Defined Exact Conversions

By international treaty and standards definitions:
- **Inch to Millimeter**: Exactly `1 in = 25.4 mm = 0.0254 m` (1959 International Yard and Pound Agreement).
- **Foot to Meter**: Exactly `1 ft = 0.3048 m`.
- **Yard to Meter**: Exactly `1 yd = 0.9144 m`.
- **Mile to Meter**: Exactly `1 mi = 1,609.344 m`.
- **Pound (avoirdupois) to Kilogram**: Exactly `1 lb = 0.45359237 kg`.
- **Ounce (avoirdupois) to Kilogram**: Exactly `1 oz = 1/16 lb = 0.028349523125 kg`.
- **US Liquid Gallon**: Exactly `231 cubic inches = 231 * (0.0254)^3 m³ = 0.003785411784 m³ = 3.785411784 L`.
- **Imperial Gallon**: Defined as exactly `4.54609 L = 0.00454609 m³` (Weights and Measures Act 1985).
- **International Acre**: Exactly `10 square chains = 43,560 sq ft = 43,560 * (0.3048)^2 m² = 4,046.8564224 m²`.

### 2. Physical Constants & Derived Units

- **Standard Acceleration of Gravity ($g_n$)**: Exactly `9.80665 m/s²` (3rd CGPM, 1901).
- **Pound-Force ($1\text{ lbf}$)**: Defined as the force exerted by standard gravity on a mass of one avoirdupois pound:
  $$\text{lbf} = 0.45359237\text{ kg} \times 9.80665\text{ m/s}^2 = 4.4482216152605\text{ N}$$
- **Pound per Square Inch ($1\text{ psi}$)**: Derived from pound-force divided by one square inch ($0.0254 \times 0.0254\text{ m}^2$):
  $$\text{psi} = \frac{4.4482216152605}{(0.0254)^2}\text{ Pa} \approx 6,894.757293168361\text{ Pa}$$

---

## Numerical Precision & IEEE-754 Disclosures

- All numerical values are evaluated in JavaScript `Number` representing **IEEE-754 double-precision floating-point (binary64)** format.
- Binary floating-point cannot represent every decimal fraction (e.g. `0.1` or `1/3`) with infinite precision.
- **Recommended Assertion Tolerances**:
  - Near zero: absolute difference $\le 10^{-10}$
  - Larger values: relative difference $\le 10^{-12}$
- The library does not claim "100% exact symbolic infinite precision" or scientific certification.
