<script setup lang="ts">
defineProps<{ value: number; held?: boolean; disabled?: boolean; index: number }>()
defineEmits<{ toggle: [] }>()
const positions: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}
</script>
<template>
  <div class="die-wrap">
    <button
      class="die"
      :class="{ held }"
      :disabled="disabled"
      :aria-label="`Die ${index + 1}: ${value}${held ? ', held' : ', not held'}`"
      :aria-pressed="!!held"
      @click="$emit('toggle')"
    >
      <span
        v-for="position in 9"
        :key="position"
        :class="{ pip: positions[value]?.includes(position - 1) }"
      />
    </button>
    <span class="hold-label">{{ held ? 'HELD' : ' ' }}</span>
  </div>
</template>
<style scoped>
.die-wrap {
  width: clamp(42px, 11vw, 76px);
  text-align: center;
}
.die {
  width: 100%;
  aspect-ratio: 1;
  padding: 19%;
  display: grid;
  grid-template: repeat(3, 1fr) / repeat(3, 1fr);
  gap: 11%;
  border: 1px solid #dddccf;
  border-radius: 17%;
  background: #fffdf3;
  box-shadow:
    0 5px 0 #d7d7c9,
    0 9px 18px #0b292820;
  transition:
    transform 0.15s,
    background 0.15s;
}
.die:not(:disabled) {
  cursor: pointer;
}
.die:disabled {
  opacity: 1;
}
.die.held {
  background: #dbeaa6;
  border-color: #a4b775;
  box-shadow: 0 5px 0 #9eaf6b;
  transform: translateY(-7px);
}
.pip {
  background: #254b41;
  border-radius: 50%;
}
.hold-label {
  display: block;
  height: 20px;
  margin-top: 12px;
  color: #c7d998;
  font-size: 9px;
  letter-spacing: 1.4px;
  font-weight: 700;
}
.die:focus-visible {
  outline: 3px solid #d2eaa1;
  outline-offset: 7px;
}
@media (prefers-reduced-motion: reduce) {
  .die {
    transition: none;
  }
}
</style>
