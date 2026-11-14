// Matériaux PBR. Valeurs de départ du cahier des charges : métal 1.0, poli 0.12–0.20, satiné 0.25–0.38, anisotropie élevée.
import * as THREE from "three";
import { normalesSatin, perlage, cotes } from "./textures.js";

export function materiaux() {
  const satinN = normalesSatin(512); satinN.repeat.set(1.2, 1.2); satinN.center.set(.5, .5); satinN.rotation = Math.PI / 2; // stries dans la longueur des maillons
  const acierPoli = new THREE.MeshPhysicalMaterial({ name: "Oystersteel poli", color: 0xeef0f3, metalness: 1, roughness: .13, clearcoat: .6, clearcoatRoughness: .06, envMapIntensity: 1.35 });
  const acierSatine = new THREE.MeshPhysicalMaterial({ name: "Oystersteel satiné", color: 0xe1e4e8, metalness: 1, roughness: .3, anisotropy: .55, anisotropyRotation: Math.PI / 2, normalMap: satinN, normalScale: new THREE.Vector2(.18, .18), envMapIntensity: 1.3 });
  const orGris = new THREE.MeshPhysicalMaterial({ name: "Or gris 18 ct", color: 0xf5f6f8, metalness: 1, roughness: .12, clearcoat: .5, envMapIntensity: 1.45 });
  const chromalight = new THREE.MeshPhysicalMaterial({ name: "Chromalight", color: 0xf4f6f2, roughness: .45, metalness: 0, emissive: 0x6fa9ff, emissiveIntensity: 0 });
  const joint = new THREE.MeshStandardMaterial({ name: "Joint", color: 0x0c0c0d, roughness: .6, metalness: 0 });
  const saphir = new THREE.MeshPhysicalMaterial({ name: "Verre saphir", color: 0xffffff, metalness: 0, roughness: 0, transmission: 1, thickness: 1.2, ior: 1.77, transparent: true, opacity: 1, attenuationColor: new THREE.Color(0xeaf3ff), attenuationDistance: 40, specularIntensity: .35, envMapIntensity: .55 }); // saphir traité antireflet : reflets discrets
  const orRotor = new THREE.MeshPhysicalMaterial({ name: "Or jaune 18 ct", map: cotes(1024, [228, 186, 92]), metalness: 1, roughness: .2, clearcoat: .5, envMapIntensity: 1.4 });
  const laiton = new THREE.MeshPhysicalMaterial({ name: "Laiton doré", color: 0xd9b56a, metalness: 1, roughness: .22, envMapIntensity: 1.2 });
  const platine = new THREE.MeshStandardMaterial({ name: "Platine perlée", map: perlage(1024), color: 0xc5c9cf, metalness: .75, roughness: .42, envMapIntensity: .8 });
  const pont = new THREE.MeshPhysicalMaterial({ name: "Ponts rhodiés", map: cotes(1024), color: 0xf6f8fa, metalness: .55, roughness: .3, clearcoat: .4, clearcoatRoughness: .1, envMapIntensity: 1.25 });
  const acierMvt = new THREE.MeshPhysicalMaterial({ name: "Acier poli (mouvement)", color: 0xdfe3e8, metalness: 1, roughness: .15, envMapIntensity: 1.2 });
  const rubis = new THREE.MeshPhysicalMaterial({ name: "Rubis synthétique", color: 0xa00f2a, metalness: 0, roughness: .04, transmission: .35, thickness: .3, ior: 1.76, clearcoat: 1, emissive: 0x2a0410, emissiveIntensity: .5 });
  const bleui = new THREE.MeshPhysicalMaterial({ name: "Acier bleui / Parachrom", color: 0x2546a8, metalness: 1, roughness: .18, envMapIntensity: 1.3 });
  for (const m of [acierPoli, acierSatine, orGris, laiton, orRotor, pont, platine, acierMvt, bleui, joint]) m.side = THREE.DoubleSide;
  return { acierPoli, acierSatine, orGris, chromalight, joint, saphir, orRotor, laiton, platine, pont, acierMvt, rubis, bleui };
}
