import * as THREE from '../../libs/three/three.module.js';
import { GLTFLoader } from '../../libs/three/jsm/GLTFLoader.js';
import { RGBELoader } from '../../libs/three/jsm/RGBELoader.js';
import { XRControllerModelFactory } from '../../libs/three/jsm/XRControllerModelFactory.js';
import { Stats } from '../../libs/stats.module.js';
import { VRButton } from '../../libs/VRButton.js';
import { TeleportMesh } from '../../libs/TeleportMesh.js';
import { Interactable } from '../../libs/Interactable.js';
import { Player } from '../../libs/Player.js';
import { LoadingBar } from '../../libs/LoadingBar.js';

class App{
	constructor(){
		const container = document.createElement( 'div' );
		document.body.appendChild( container );

		this.assetsPath = '../../assets/';
        
		this.camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 3000 );
		this.camera.position.set( 0, 1.6, 0 );
        
		this.scene = new THREE.Scene();
        
		const ambient = new THREE.HemisphereLight(0x555555, 0x999999);
		this.scene.add(ambient);
		
		this.sun = new THREE.DirectionalLight( 0xAAAAFF, 2.5 );
		this.sun.castShadow = true;

		const lightSize = 5;
        this.sun.shadow.camera.near = 0.1;
        this.sun.shadow.camera.far = 17;
		this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -lightSize;
		this.sun.shadow.camera.right = this.sun.shadow.camera.top = lightSize;

        //this.sun.shadow.bias = 0.0039;
        this.sun.shadow.mapSize.width = 1024;
        this.sun.shadow.mapSize.height = 1024;
        
		this.sun.position.set( 0, 10, 10 );
		this.scene.add( this.sun );
		
		this.debug = { showPath:false, teleport: true };
			
		this.renderer = new THREE.WebGLRenderer({ antialias: true } );
		this.renderer.setPixelRatio( window.devicePixelRatio );
		this.renderer.setSize( window.innerWidth, window.innerHeight );
		this.renderer.shadowMap.enabled = true;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
		container.appendChild( this.renderer.domElement );
        this.setEnvironment();

        this.workingMatrix = new THREE.Matrix4();

		this.clock = new THREE.Clock();
		
		this.stats = new Stats();
		container.appendChild( this.stats.dom );
		
		this.loadingBar = new LoadingBar();
        
		this.loadEnvironment();
        
		this.raycaster = new THREE.Raycaster();
    		
    	this.loading = true;
    	
		window.addEventListener('resize', this.render.bind(this));
	}
	
    resize(){
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize( window.innerWidth, window.innerHeight ); 
    }
    
    setEnvironment(){
        const loader = new RGBELoader().setDataType( THREE.UnsignedByteType );
        const pmremGenerator = new THREE.PMREMGenerator( this.renderer );
        pmremGenerator.compileEquirectangularShader();
        
        const self = this;
        
        loader.load( '../../assets/hdr/venice_sunset_1k.hdr', ( texture ) => {
          const envMap = pmremGenerator.fromEquirectangular( texture ).texture;
          pmremGenerator.dispose();

          self.scene.environment = envMap;

        }, undefined, (err)=>{
            console.error( 'An error occurred setting the environment');
        } );
    }
    
	loadEnvironment(){
        
		const loader = new GLTFLoader( ).setPath(this.assetsPath);
        const self = this;
        
        this.interactables = [];
        
		
		// Load a glTF resource
		loader.load(
			// resource URL
			'dungeon.glb',
			// called when the resource is loaded
			function ( gltf ) {
                const scale = 0.5;
                
				self.scene.add( gltf.scene );
				
				gltf.scene.traverse(function (child) {
                    let interactable;
                    
    				if (child.isMesh){
						if (child.name=="Navmesh"){
							child.material.visible = false;
							self.navmesh = child;
                            child.geometry.scale(scale, scale, scale);
                            child.scale.set(2,2,2);
						}else if (child.name== "SD_Prop_Chest_Skull_Lid_01"){
                            self.interactables.push( new Interactable( child, {
                                mode:'tweens',
                                tweens:[{
                                    target: child.quaternion,
                                    channel: 'x',
                                    start: 0,
                                    end: -0.7,
                                    duration: 1
                                }]
                            }));
                        }else if (child.name == "Door_1"){
                            self.interactables.push( new Interactable( child, {
                                mode:'tweens',
                                tweens:[{
                                    target: child.quaternion,
                                    channel:'z',
                                    start: 0,
                                    end: 0.6,
                                    duration: 1
                                }]
                            }));
                        }
					}
				});
                
                gltf.scene.scale.set( scale, scale, scale );
                
                self.initGame();
			},
			// called while loading is progressing
			function ( xhr ) {

				self.loadingBar.progress = (xhr.loaded / xhr.total);
				
			},
			// called when loading has errors
			function ( error ) {

				console.error( error.message );

			}
		);
	}			
	
	initGame(){
		this.player = this.createPlayer();
        
        const locations = [
            new THREE.Vector3(-0.409, 0.086, 4.038),
            new THREE.Vector3(-0.846, 0.112, 5.777),
            new THREE.Vector3( 5.220, 0.176, 2.677),
            new THREE.Vector3( 1.490, 2.305, -1.599),
            new THREE.Vector3( 7.565, 2.694, 0.008),
            new THREE.Vector3(-8.417, 2.676, 0.192),
            new THREE.Vector3(-6.644, 2.600, -4.114)
        ];
        
        const self = this;
        
        this.teleports = [];
        locations.forEach( location => {
            const teleport = new TeleportMesh();
            teleport.position.copy( location );
            self.scene.add( teleport );
            self.teleports.push(teleport);
        })
        
        const waypoints = [
            new THREE.Vector3(-3.550, 0.263, 4.104),
            new THREE.Vector3( 2.559, 0.093, 3.052),
            new THREE.Vector3(-1.291, 0.086, 0.637),
            new THREE.Vector3( 9.339, 2.689, 0.447),
            new THREE.Vector3( 7.144, 2.660, 0.783),
            new THREE.Vector3( 6.816, 2.647, 7.008),
            new THREE.Vector3(-8.298, 2.636, 0.930),
            new THREE.Vector3(-1.746, 2.692,-1.986),
            new THREE.Vector3(-7.422, 2.586, 6.639),
        ];
        
		this.setupXR();

		this.loading = false;

		this.renderer.setAnimationLoop( this.render.bind(this) );

		this.loadingBar.visible = false;
	}
	
    createMarker(geometry, material){
        const mesh = new THREE.Mesh( geometry, material );
        mesh.visible = false;
        this.scene.add( mesh );
        return mesh;
    }
	
    buildControllers(){
        const controllerModelFactory = new XRControllerModelFactory();

        const geometry = new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, -1 ) ] );

        const line = new THREE.Line( geometry );
        line.name = 'ray';
		line.scale.z = 10;
        
        const geometry2 = new THREE.SphereGeometry(0.03, 8, 6);
        const material = new THREE.MeshBasicMaterial( { color: 0xFF0000 });
        
        const controllers = [];
        
        for( let i=0; i<=1; i++){
            const controller = this.renderer.xr.getController( i );
            controller.userData.index = i;
            controller.userData.selectPressed = false;
            controller.add( line.clone() );
            controller.userData.marker = this.createMarker( geometry2, material );
            controllers.push( controller );
            this.dolly.add( controller );
            
            const grip = this.renderer.xr.getControllerGrip( i );
            grip.add( controllerModelFactory.createControllerModel( grip ) );
            this.dolly.add( grip );
        }  
        
        return controllers;
    }
    
    setupXR(){
        this.renderer.xr.enabled = true;

        const self = this;
        
        function onSelectStart( ){
            this.userData.selectPressed = true;
            if (this.userData.teleport){
                self.player.object.position.copy( this.userData.teleport.position );
                self.teleports.forEach( teleport => teleport.fadeOut(0.5) );
            }else if( this.userData.interactable ){
                //Step 4 - call play for the interactable
                this.userData.interactable.play();
            }else if (this.userData.marker.visible){
                const pos = this.userData.marker.position;
                console.log( `${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)}`);
            }
        }
        
        function onSelectEnd( ){
            this.userData.selectPressed = false;
        }
        
        function onSqueezeStart( ){
            this.userData.squeezePressed = true;
            self.teleports.forEach( teleport => teleport.fadeIn(1) );
        }
        
        function onSqueezeEnd( ){
            this.userData.squeezePressed = false;
            self.teleports.forEach( teleport => teleport.fadeOut(1) );
        }
        
        const btn = new VRButton( this.renderer );
        
        this.controllers = this.buildControllers();
        
        this.controllers.forEach( controller => {
            controller.addEventListener( 'selectstart', onSelectStart );
            controller.addEventListener( 'selectend', onSelectEnd);
            controller.addEventListener( 'squeezestart', onSqueezeStart );
            controller.addEventListener( 'squeezeend', onSqueezeEnd );
        })
        
        this.collisionObjects = [this.navmesh];
        this.teleports.forEach( teleport => self.collisionObjects.push(teleport.children[0]) );
        
        //Step 2 - for each Interactable add the mesh property to the collisionObjects array.
        this.interactables.forEach( interactable => self.collisionObjects.push(
            interactable.mesh));
                    
    }

    intersectObjects( controller ) {

        const line = controller.getObjectByName( 'ray' );
        this.workingMatrix.identity().extractRotation( controller.matrixWorld );

        this.raycaster.ray.origin.setFromMatrixPosition( controller.matrixWorld );
        this.raycaster.ray.direction.set( 0, 0, - 1 ).applyMatrix4( this.workingMatrix );

        const intersects = this.raycaster.intersectObjects( this.collisionObjects );
        const marker = controller.userData.marker;
        marker.visible = false;
        
        controller.userData.teleport = undefined;
        controller.userData.interactable = undefined;
        
        if ( intersects.length > 0 ) {

            const intersect = intersects[ 0 ];
            line.scale.z = intersect.distance;
            
            if (intersect.object === this.navmesh){
                marker.scale.set(1,1,1);
                marker.position.copy( intersect.point );
                marker.visible = true;
            }else if (intersect.object.parent && intersect.object.parent instanceof TeleportMesh){
                intersect.object.parent.selected = true;
                controller.userData.teleport = intersect.object.parent;
            }else{
                //Step 3 - is the intersect.object an Interactable
                const tmp = this.interactables.filter( interactable => 
                    interactable.mesh == intersect.object);
                //If so set the Interactable property of the controllers userData object
                if (tmp.length>0) controller.userData.interactable = tmp[0];
            }
            
        } 

    }

    createPlayer(){
        const target = new THREE.Object3D();
        target.position.set(-3, 0.25, 2); 
        
        const options = {
					object: target,
					speed: 5,
					app: this,
					name: 'player',
					npc: false
				};
				
		const player = new Player(options);
           
        this.dolly = new THREE.Object3D();
        this.dolly.position.set(0, -0.25, 0);
        this.dolly.add(this.camera);
        
        this.dummyCam = new THREE.Object3D();
        this.camera.add( this.dummyCam );
        
        target.add(this.dolly);
        
        this.dolly.rotation.y = Math.PI;
        
        return player;
    }
    
	render(){
		const dt = this.clock.getDelta();
		const self = this;
		
		this.sun.position.copy(this.dummyCam.position);
		this.sun.position.y += 10;
		this.sun.position.z += 10;
		
		this.stats.update();
        
        if (this.renderer.xr.isPresenting){
            
            this.teleports.forEach( teleport =>{
                teleport.selected = false;
                teleport.update();
            });

            this.controllers.forEach( controller => {
                self.intersectObjects( controller );
            });
            
            //Step 1 call update for each Interactable
            this.interactables.forEach( interactable => interactable.update(dt));

            this.player.update(dt);
        }
		
		this.renderer.render(this.scene, this.camera);
	}
}

export { App };
