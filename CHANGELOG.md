## 0.1.3 (WIP)

## 0.1.2 (2016-10-16)

* Add temporary 'wrap-around sequence number' fix
* Wait for initial sync packet to start playing audio
* Actually sync the audio
* Fix decryption bug for node >=6.0.0
* Add software volume support

## 0.1.1 (2016-06-08)

* Fixed 'main' entry in package.json pointing to the wrong file
* Transmission requests are now sent from the TCP control server socket,
  most players would only respond on the same port.
* Added default settings and new 'retransmit_timeout' setting.

## 0.1.0 (2016-06-06)

* First release