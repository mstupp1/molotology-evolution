import * as Phaser from 'phaser';
import { SceneKey } from '../constants';

/** Loads the bare minimum needed to show the Preloader, then hands off. */
export class Boot extends Phaser.Scene {
    constructor() {
        super(SceneKey.Boot);
    }

    create() {
        this.scene.start(SceneKey.Preloader);
    }
}
